import { GraphQLSchema, print } from 'graphql';
import { applyAuthorizationToQueryTree } from '../authorization/execution';
import { globalContext } from '../config/global';
import { addOperationBasedResolvers, OperationParams } from '../graphql/operation-based-resolvers';
import { distillOperation } from '../graphql/query-distiller';
import { Model } from '../model/implementation';
import { NullQueryNode, QueryNode } from '../query-tree';
import { evaluateQueryStatically } from '../query/static-evaluation';
import { SchemaTransformationContext } from '../schema/preparation/transformation-pipeline';
import { NamespaceQueryTypeGenerator } from './namespace-query-type-generator';
import { OutputTypeGenerator } from './output-type-generator';
import { buildObjectQueryNode, convertToGraphQLObjectType, QueryNodeObjectType } from './query-node-object-type';

export class SchemaGenerator {
    private outputTypeGenerator = new OutputTypeGenerator();
    private namespaceQueryTypeGenerator = new NamespaceQueryTypeGenerator(this.outputTypeGenerator);

    constructor(
        private context: SchemaTransformationContext
    ) {

    }

    generate(model: Model) {
        const queryType = this.namespaceQueryTypeGenerator.generate(model.rootNamespace);
        const mutationType = this.namespaceQueryTypeGenerator.generate(model.rootNamespace);
        const dumbSchema = new GraphQLSchema({
            query: convertToGraphQLObjectType(queryType)
        });
        return addOperationBasedResolvers(dumbSchema, op => {
            const rootType = op.operation.operation === 'mutation' ? mutationType : queryType;
            return this.resolveOperation(op, rootType);
        });
    }

    private async resolveOperation(operationInfo: OperationParams, rootType: QueryNodeObjectType) {
        globalContext.registerContext(this.context);
        const logger = globalContext.loggerProvider.getLogger('query-resolvers');
        try {
            let queryTree: QueryNode;
            try {
                logger.debug(`Executing ${operationInfo.operation.operation} ${operationInfo.operation.name ? operationInfo.operation.name.value : ''}`);
                if (logger.isTraceEnabled()) {
                    logger.trace(`Operation: ${print(operationInfo.operation)}`);
                }
                const operation = distillOperation(operationInfo);
                if (logger.isTraceEnabled()) {
                    logger.trace(`DistilledOperation: ${operation.describe()}`);
                }

                const requestRoles = this.getRequestRoles(operationInfo.context);
                logger.debug(`Request roles: ${requestRoles.join(', ')}`);
                queryTree = buildObjectQueryNode(new NullQueryNode(), rootType, operation.selectionSet);
                if (logger.isTraceEnabled()) {
                    logger.trace('Before authorization: ' + queryTree.describe());
                }
                queryTree = applyAuthorizationToQueryTree(queryTree, { authRoles: requestRoles});
                if (logger.isTraceEnabled()) {
                    logger.trace('After authorization: ' + queryTree.describe());
                }
            } finally {
                globalContext.unregisterContext();
            }
            let { canEvaluateStatically, result } = evaluateQueryStatically(queryTree);
            if (!canEvaluateStatically) {
                result = await this.context.databaseAdapter.execute(queryTree);
                logger.debug(`Execution successful`)
            } else {
                logger.debug(`Execution successful (evaluated statically without database adapter))`);
            }
            if (logger.isTraceEnabled()) {
                logger.trace('Result: ' + JSON.stringify(result, undefined, '  '));
            }
            return result;
        } catch (e) {
            logger.error("Error evaluating GraphQL query: " + e.stack);
            throw e;
        }
    }

    private getRequestRoles(context: any): string[] {
        if (context.authRoles != undefined) {
            return []
        }
        if (!Array.isArray(context.authRoles)) {
            throw new Error(`Expected authRoles property in schema context to be an array, but is ${typeof context.authRoles}`);
        }
        return context.authRoles;
    }

}



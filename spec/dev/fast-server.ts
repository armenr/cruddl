import { RequestHandler } from 'express';
import { execute, formatError, GraphQLError, parse, validate } from 'graphql';
import { DatabaseAdapter } from '../../src/database/database-adapter';
import { Project } from '../../src/project/project';

export function createFastApp(project: Project, databaseAdapter: DatabaseAdapter): RequestHandler {
    const executor = project.createSchemaExecutor(databaseAdapter);
    const slowSchema = project.createSchema(databaseAdapter);

    const contextValue = { authRoles: ['allusers', 'logistics-reader', 'system'] };

    return async (req, res) => {
        const { query, operationName, variables: variableValues } = req.body;
        const document = parse(query);
        const validationErrors = validate(slowSchema, document);
        if (validationErrors.length) {
            res.end(JSON.stringify({
                errors: validationErrors.map(e => formatError(e))
            }));
        }
        const fastPromise = executor.tryExecute({
            document,
            variableValues,
            contextValue,
            operationName,
            options: {
                recordPlan: true,
                recordTimings: true,
                mutationMode: 'rollback',
                queryMemoryLimit: 5000000,
                authRoles: contextValue.authRoles
            }
        });
        if (!fastPromise) {
            const { data, errors } = await execute({
                schema: slowSchema,
                contextValue,
                operationName,
                rootValue: {},
                document
            });
            res.end(JSON.stringify({ data, errors }));
            return;
        }

        try {
            const result = await fastPromise;
            res.end(JSON.stringify({
                data: result.data,
                errors: result.errors ? result.errors.map(e => formatError(e)) : undefined
            }));
        } catch (e) {
            res.end(JSON.stringify({
                errors: [
                    formatError(new GraphQLError(e.stack))
                ]
            }));
        }
    };
}

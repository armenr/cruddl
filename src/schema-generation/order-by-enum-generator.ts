import { GraphQLEnumType } from 'graphql';
import { chain } from 'lodash';
import memorize from 'memorize-decorator';
import { Field, ObjectType } from '../model';
import { OrderClause, OrderDirection, QueryNode } from '../query-tree';
import { ORDER_BY_ASC_SUFFIX, ORDER_BY_DESC_SUFFIX } from '../schema/constants';
import { getOrderByTypeName } from '../schema/names';
import { flatMap } from '../utils/utils';
import { createFieldNode } from './field-nodes';

export class OrderByEnumType {
    constructor(public readonly objectType: ObjectType, public readonly values: ReadonlyArray<OrderByEnumValue>) {

    }

    get name() {
        return getOrderByTypeName(this.objectType.name);
    }

    @memorize()
    private get valueMap(): Map<string, OrderByEnumValue> {
        return new Map(this.values.map((v): [string, OrderByEnumValue] => ([v.name, v])));
    }

    getValue(name: string): OrderByEnumValue|undefined {
        return this.valueMap.get(name);
    }

    getValueOrThrow(name: string): OrderByEnumValue {
        const value = this.valueMap.get(name);
        if (!value) {
            throw new Error(`Expected "${this.name}" to have value "${name}"`);
        }
        return value;
    }

    @memorize()
    getEnumType(): GraphQLEnumType {
        return new GraphQLEnumType({
            name: this.name,
            values: chain(this.values)
                .keyBy(value => value.name)
                .mapValues(value => ({value: value.name}))
                .value()
        });
    }
}

export class OrderByEnumValue {
    constructor(public readonly path: ReadonlyArray<Field>, public readonly direction: OrderDirection) {

    }

    get underscoreSeparatedPath(): string {
        return this.path.map(field => field.name).join('_');
    }

    get name() {
        return this.underscoreSeparatedPath + (this.direction == OrderDirection.ASCENDING ? ORDER_BY_ASC_SUFFIX : ORDER_BY_DESC_SUFFIX);
    }

    getValueNode(itemNode: QueryNode): QueryNode {
        return this.path.reduce((node, field) => createFieldNode(field, node), itemNode);
    }

    getClause(itemNode: QueryNode): OrderClause {
        return new OrderClause(this.getValueNode(itemNode), this.direction);
    }
}

export class OrderByEnumGenerator {
    @memorize()
    generate(objectType: ObjectType) {
        return new OrderByEnumType(objectType, this.getValues(objectType, []));
    }

    private getValues(type: ObjectType, path: ReadonlyArray<Field>): ReadonlyArray<OrderByEnumValue> {
        return flatMap(type.fields, field => this.getValuesForField(field, path));
    }

    private getValuesForField(field: Field, path: ReadonlyArray<Field>) {
        // Don't recurse
        if (path.includes(field)) {
            return [];
        }

        // can't sort by list value
        if (field.isList) {
            return [];
        }

        const newPath = [...path, field];
        if (field.type.isObjectType) {
            return this.getValues(field.type, newPath);
        } else {
            // currently, all scalars and enums are ordered types
            return [
                new OrderByEnumValue(newPath, OrderDirection.ASCENDING),
                new OrderByEnumValue(newPath, OrderDirection.DESCENDING),
            ]
        }
    }

}

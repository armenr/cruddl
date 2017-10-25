import {ASTValidator} from "../ast-validator";
import {DocumentNode} from "graphql";
import {ValidationMessage} from "../validation-message";
import {getObjectTypes, hasDirectiveWithName} from "../../schema-utils";
import {RELATION_DIRECTIVE, ROOT_ENTITY_DIRECTIVE} from "../../schema-defaults";

export const VALIDATION_ERROR_RELATION_ON_NON_ROOT_ENTITY = '@relation is only allowed in @rootEntities.'

export class RelationsOnlyOnRootEntitiesValidator implements ASTValidator {

    validate(ast: DocumentNode): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];
        getObjectTypes(ast).forEach(objectType => objectType.fields.forEach(field => {
            if (!hasDirectiveWithName(objectType, ROOT_ENTITY_DIRECTIVE) && field.directives && field.directives.some(directive => directive.name.value === RELATION_DIRECTIVE)) {
                validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_RELATION_ON_NON_ROOT_ENTITY, {}, field.loc))
            }
        }));
        return validationMessages;
    }

}
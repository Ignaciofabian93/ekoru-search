import { Kind } from 'graphql';
import { Scalar, CustomScalar } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

/**
 * No custom `DateTime` scalar here on purpose: `@Field(() => Date)` already maps
 * to Nest's built-in GraphQLISODateTime, which is also named "DateTime".
 * Registering our own would put two types with that name in the schema and the
 * federated schema build fails at boot.
 */

@Scalar('JSON')
export class JSONScalar implements CustomScalar<any, any> {
  description = 'JSON custom scalar type';

  parseValue(value: any): any {
    return value;
  }

  serialize(value: any): any {
    return value;
  }

  parseLiteral(ast: any): any {
    if (ast.kind === Kind.OBJECT) {
      return JSON.parse(JSON.stringify(ast.value));
    }
    return null;
  }
}

export { GraphQLJSON };

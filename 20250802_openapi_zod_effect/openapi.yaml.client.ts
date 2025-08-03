import { makeApi, Zodios, type ZodiosOptions } from "@zodios/core";
import { z } from "zod";

const User = z
  .object({ id: z.number().int(), name: z.string().optional() })
  .passthrough();

export const schemas = {
  User,
};

export const endpoints = makeApi([
  {
    method: "get",
    path: "/users",
    alias: "getUsers",
    description: `Returns an array of User model`,
    requestFormat: "json",
    response: z.array(User),
  },
  {
    method: "post",
    path: "/users",
    alias: "postUsers",
    description: `Create a new User`,
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        description: `user to create`,
        type: "Body",
        schema: User,
      },
    ],
    response: z.void(),
  },
  {
    method: "get",
    path: "/users/:userId",
    alias: "getUsersUserId",
    description: `Returns a single User model`,
    requestFormat: "json",
    parameters: [
      {
        name: "userId",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: z.object({}).partial().passthrough(),
  },
]);

export const api = new Zodios(endpoints);

export function createApiClient(baseUrl: string, options?: ZodiosOptions) {
  return new Zodios(baseUrl, endpoints, options);
}

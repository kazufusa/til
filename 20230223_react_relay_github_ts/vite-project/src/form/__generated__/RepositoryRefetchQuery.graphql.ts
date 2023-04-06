/**
 * @generated SignedSource<<a8321ae84693a448c6367c156f7179ac>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type RepositoryRefetchQuery$variables = {
  name?: string | null;
  owner?: string | null;
  skip?: boolean | null;
};
export type RepositoryRefetchQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<"RepositoryFragment">;
};
export type RepositoryRefetchQuery = {
  response: RepositoryRefetchQuery$data;
  variables: RepositoryRefetchQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": "",
    "kind": "LocalArgument",
    "name": "name"
  },
  {
    "defaultValue": "",
    "kind": "LocalArgument",
    "name": "owner"
  },
  {
    "defaultValue": true,
    "kind": "LocalArgument",
    "name": "skip"
  }
],
v1 = {
  "kind": "Variable",
  "name": "name",
  "variableName": "name"
},
v2 = {
  "kind": "Variable",
  "name": "owner",
  "variableName": "owner"
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "RepositoryRefetchQuery",
    "selections": [
      {
        "args": [
          (v1/*: any*/),
          (v2/*: any*/),
          {
            "kind": "Variable",
            "name": "skip",
            "variableName": "skip"
          }
        ],
        "kind": "FragmentSpread",
        "name": "RepositoryFragment"
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "RepositoryRefetchQuery",
    "selections": [
      {
        "condition": "skip",
        "kind": "Condition",
        "passingValue": false,
        "selections": [
          {
            "alias": null,
            "args": [
              (v1/*: any*/),
              (v2/*: any*/)
            ],
            "concreteType": "Repository",
            "kind": "LinkedField",
            "name": "repository",
            "plural": false,
            "selections": [
              {
                "alias": null,
                "args": [
                  {
                    "kind": "Literal",
                    "name": "first",
                    "value": 30
                  }
                ],
                "concreteType": "UserConnection",
                "kind": "LinkedField",
                "name": "assignableUsers",
                "plural": false,
                "selections": [
                  {
                    "alias": null,
                    "args": null,
                    "concreteType": "User",
                    "kind": "LinkedField",
                    "name": "nodes",
                    "plural": true,
                    "selections": [
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "name",
                        "storageKey": null
                      },
                      (v3/*: any*/)
                    ],
                    "storageKey": null
                  }
                ],
                "storageKey": "assignableUsers(first:30)"
              },
              (v3/*: any*/)
            ],
            "storageKey": null
          }
        ]
      }
    ]
  },
  "params": {
    "cacheID": "129e1f4afe72a04626037c6b4e8a68ae",
    "id": null,
    "metadata": {},
    "name": "RepositoryRefetchQuery",
    "operationKind": "query",
    "text": "query RepositoryRefetchQuery(\n  $name: String = \"\"\n  $owner: String = \"\"\n  $skip: Boolean = true\n) {\n  ...RepositoryFragment_3brY8s\n}\n\nfragment RepositoryFragment_3brY8s on Query {\n  repository(name: $name, owner: $owner) @skip(if: $skip) {\n    assignableUsers(first: 30) {\n      nodes {\n        name\n        id\n      }\n    }\n    id\n  }\n}\n"
  }
};
})();

(node as any).hash = "ed999f4431f76067288031fd7b32e415";

export default node;

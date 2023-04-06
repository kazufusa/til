/**
 * @generated SignedSource<<5751314fda1f2c8a7fa0457c5d7e49fc>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type FormQuery$variables = {};
export type FormQuery$data = {
  readonly search: {
    readonly " $fragmentSpreads": FragmentRefs<"RepositoriesFragment">;
  };
  readonly " $fragmentSpreads": FragmentRefs<"RepositoryFragment">;
};
export type FormQuery = {
  response: FormQuery$data;
  variables: FormQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "kind": "Literal",
    "name": "first",
    "value": 10
  },
  {
    "kind": "Literal",
    "name": "query",
    "value": "relay"
  },
  {
    "kind": "Literal",
    "name": "type",
    "value": "REPOSITORY"
  }
],
v1 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "__typename",
  "storageKey": null
},
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "FormQuery",
    "selections": [
      {
        "alias": null,
        "args": (v0/*: any*/),
        "concreteType": "SearchResultItemConnection",
        "kind": "LinkedField",
        "name": "search",
        "plural": false,
        "selections": [
          {
            "args": null,
            "kind": "FragmentSpread",
            "name": "RepositoriesFragment"
          }
        ],
        "storageKey": "search(first:10,query:\"relay\",type:\"REPOSITORY\")"
      },
      {
        "args": null,
        "kind": "FragmentSpread",
        "name": "RepositoryFragment"
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "FormQuery",
    "selections": [
      {
        "alias": null,
        "args": (v0/*: any*/),
        "concreteType": "SearchResultItemConnection",
        "kind": "LinkedField",
        "name": "search",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": null,
            "kind": "LinkedField",
            "name": "nodes",
            "plural": true,
            "selections": [
              (v1/*: any*/),
              {
                "kind": "InlineFragment",
                "selections": [
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "name",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "concreteType": null,
                    "kind": "LinkedField",
                    "name": "owner",
                    "plural": false,
                    "selections": [
                      (v1/*: any*/),
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "login",
                        "storageKey": null
                      },
                      (v2/*: any*/)
                    ],
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "nameWithOwner",
                    "storageKey": null
                  }
                ],
                "type": "Repository",
                "abstractKey": null
              },
              {
                "kind": "InlineFragment",
                "selections": [
                  (v2/*: any*/)
                ],
                "type": "Node",
                "abstractKey": "__isNode"
              }
            ],
            "storageKey": null
          }
        ],
        "storageKey": "search(first:10,query:\"relay\",type:\"REPOSITORY\")"
      }
    ]
  },
  "params": {
    "cacheID": "c32fd1fdf150dc0584ce3d388bf2f398",
    "id": null,
    "metadata": {},
    "name": "FormQuery",
    "operationKind": "query",
    "text": "query FormQuery {\n  search(query: \"relay\", type: REPOSITORY, first: 10) {\n    ...RepositoriesFragment\n  }\n}\n\nfragment RepositoriesFragment on SearchResultItemConnection {\n  nodes {\n    __typename\n    ... on Repository {\n      name\n      owner {\n        __typename\n        login\n        id\n      }\n      nameWithOwner\n    }\n    ... on Node {\n      __isNode: __typename\n      id\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "369dfc64b08102c77eba9f5c6de83f6f";

export default node;

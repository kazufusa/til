/**
 * @generated SignedSource<<66cc40b8b017cfd211b5258d1a9e7c7d>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type RepositoriesFragment$data = {
  readonly nodes: ReadonlyArray<{
    readonly name?: string;
    readonly nameWithOwner?: string;
    readonly owner?: {
      readonly id: string;
    };
  } | null> | null;
  readonly " $fragmentType": "RepositoriesFragment";
};
export type RepositoriesFragment$key = {
  readonly " $data"?: RepositoriesFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"RepositoriesFragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "RepositoriesFragment",
  "selections": [
    {
      "alias": null,
      "args": null,
      "concreteType": null,
      "kind": "LinkedField",
      "name": "nodes",
      "plural": true,
      "selections": [
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
                {
                  "alias": null,
                  "args": null,
                  "kind": "ScalarField",
                  "name": "id",
                  "storageKey": null
                }
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
        }
      ],
      "storageKey": null
    }
  ],
  "type": "SearchResultItemConnection",
  "abstractKey": null
};

(node as any).hash = "e2f141152eb30aea679b7bd3ae617a0f";

export default node;

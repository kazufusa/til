/**
 * @generated SignedSource<<dc98d323be663e0628056358467a32c4>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type StarredRepositoriesFragment$data = {
  readonly starredRepositories: {
    readonly nodes: ReadonlyArray<{
      readonly nameWithOwner: string;
    } | null> | null;
  };
  readonly " $fragmentType": "StarredRepositoriesFragment";
};
export type StarredRepositoriesFragment$key = {
  readonly " $data"?: StarredRepositoriesFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"StarredRepositoriesFragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "StarredRepositoriesFragment",
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
      "concreteType": "StarredRepositoryConnection",
      "kind": "LinkedField",
      "name": "starredRepositories",
      "plural": false,
      "selections": [
        {
          "alias": null,
          "args": null,
          "concreteType": "Repository",
          "kind": "LinkedField",
          "name": "nodes",
          "plural": true,
          "selections": [
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "nameWithOwner",
              "storageKey": null
            }
          ],
          "storageKey": null
        }
      ],
      "storageKey": "starredRepositories(first:30)"
    }
  ],
  "type": "User",
  "abstractKey": null
};

(node as any).hash = "bd45c8e911016c82c37cf6af2d532875";

export default node;

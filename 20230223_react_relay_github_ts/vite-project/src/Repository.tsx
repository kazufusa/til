import { graphql, loadQuery, usePreloadedQuery } from "react-relay";
import { AddStarButton } from "./AddStarButton";
import { relayEnv } from "./relayEnv";
import { RemoveStarButton } from "./RemoveStarButton";
import { RepositoryQuery } from "./__generated__/RepositoryQuery.graphql";

const RepositoryQuery = graphql`
  query RepositoryQuery($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      id
      name
      isPrivate
      nameWithOwner
      viewerHasStarred
    }
  }
`;

const preloadedQuery = loadQuery<RepositoryQuery>(relayEnv, RepositoryQuery, {
  owner: "facebook",
  name: "relay",
});

export function Repository() {
  const data = usePreloadedQuery(RepositoryQuery, preloadedQuery);
  return (
    <>
      <p>name: {data.repository?.name}</p>
      <p>isPrivate: {`${data.repository?.isPrivate}`}</p>
      <p>nameWithOwner: {data.repository?.nameWithOwner}</p>
      <p>viewerHasStarred: {`${data.repository?.viewerHasStarred}`}</p>
      {data.repository?.viewerHasStarred && (
        <RemoveStarButton starrableId={data.repository?.id} />
      )}
      {data.repository?.viewerHasStarred === false && (
        <AddStarButton starrableId={data.repository?.id} />
      )}
    </>
  );
}

import { graphql, loadQuery, usePreloadedQuery } from "react-relay";
import { relayEnv } from "./relayEnv";
import { RepositoryQuery } from "./__generated__/RepositoryQuery.graphql";

const RepositoryQuery = graphql`
  query RepositoryQuery($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
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
    </>
  );
}

import { graphql, loadQuery, usePreloadedQuery } from "react-relay";
import { relayEnv } from "./relayEnv";
import { RepositoryQuery } from "./__generated__/RepositoryQuery.graphql"

const RepositoryQuery = graphql`
  query RepositoryQuery {
    repository(owner: "facebook", name: "relay") {
      name
      isPrivate
      nameWithOwner
      viewerHasStarred
    }
  }
`;


export function Repository() {
  const preloadedQuery = loadQuery<RepositoryQuery>(relayEnv, RepositoryQuery, {
    /* query variables */
  });
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

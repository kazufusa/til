import { graphql, loadQuery, usePreloadedQuery } from "react-relay";
import { relayEnv } from "./relayEnv";

const RepositoryNameQuery = graphql`
  query RepositoryNameQuery {
    repository(owner: "facebook", name: "relay") {
      name
      isPrivate
      nameWithOwner
    }
  }
`;

const preloadedQuery = loadQuery(relayEnv, RepositoryNameQuery, {
  /* query variables */
});

export function Repository() {
  const data = usePreloadedQuery(RepositoryNameQuery, preloadedQuery);
  return (
    <>
      <p>name: {data?.repository?.name}</p>
      <p>isPrivate: {`${data?.repository?.isPrivate}`}</p>
      <p>nameWithOwner: {data?.repository?.nameWithOwner}</p>
    </>
  );
}

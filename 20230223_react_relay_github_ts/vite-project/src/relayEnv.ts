import { Environment, Network, RecordSource, Store } from "relay-runtime";

const endpoint = "https://api.github.com/graphql";
const GITHUB_AUTH_TOKEN = import.meta.env.VITE_GITHUB_AUTH_TOKEN;

async function fetchQuery(operation: any, variables: any) {
  // Fetch data from GitHub's GraphQL API:
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `bearer ${GITHUB_AUTH_TOKEN}`,
      "Content-Type": "application/json",
    },
    mode: "cors",
    // credentials: "include",
    body: JSON.stringify({
      query: operation.text,
      variables,
    }),
  });

  // Get the response as JSON
  return await response.json();
}

export const relayEnv = new Environment({
  network: Network.create(fetchQuery),
  store: new Store(new RecordSource()),
});

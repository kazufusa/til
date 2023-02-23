import { Environment, Network, RecordSource, Store } from 'relay-runtime';

const endpoint = "http://localhost:3000"

async function fetchQuery(operation: any, variables: any) {
  return fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      query: operation.text,
      variables,
    }),
  }).then((x) => x.json())
    .catch((e) => {
      throw new e
    });
}

export const relayEnv = new Environment({
  network: Network.create(fetchQuery),
  store: new Store(new RecordSource()),
});

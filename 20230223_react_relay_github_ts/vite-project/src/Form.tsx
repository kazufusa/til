import { styled, TextField, Stack } from "@mui/material";
import { Repositories } from "./form/Repositories";
import { graphql } from "relay-runtime";
import { useLazyLoadQuery } from "react-relay";
import { type FormQuery as QueryType } from "./__generated__/FormQuery.graphql";
import { useState, Suspense, useTransition, useDeferredValue } from "react";
import Repository from "./form/Repository";

const FormQuery = graphql`
  query FormQuery($query: String!, $noQuery: Boolean = true) {
    search(query: $query, type: REPOSITORY, first: 10) @skip(if: $noQuery) {
      ...RepositoriesFragment
    }
    ...RepositoryFragment
  }
`;

function Form({ className }: { className?: string }) {
  const [name, setName] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const [isPending, startTransition] = useTransition();

  const data = useLazyLoadQuery<QueryType>(
    FormQuery,
    { query: query ?? "", noQuery: query === null || isPending },
    { fetchPolicy: "store-or-network" }
  );
  return (
    <div className={className}>
      <h2>Form</h2>
      <Stack>
        <TextField
          onChange={(v) =>
            startTransition(() => {
              setQuery(v.target.value === "" ? null : v.target.value);
            })
          }
        />
        {data && (
          <Repositories
            query={data.search ?? null}
            setName={(name: string) => setName(name)}
            setOwner={(owner: string) => setOwner(owner)}
          />
        )}
        {data && (
          <Repository
            query={data}
            name={name}
            owner={owner}
            setUserName={(name: string) => setUserName(name)}
          />
        )}
      </Stack>
    </div>
  );
}

export const StyledForm = styled(Form)``;

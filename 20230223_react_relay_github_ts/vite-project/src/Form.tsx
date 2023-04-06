import { styled } from "@mui/material";
import { Repositories } from "./form/Repositories";
import { graphql } from "relay-runtime";
import { useLazyLoadQuery } from "react-relay";
import { type FormQuery as QueryType } from "./__generated__/FormQuery.graphql";
import { useState } from "react";
import Repository from "./form/Repository";

const FormQuery = graphql`
  query FormQuery {
    search(query: "relay", type: REPOSITORY, first: 10) {
      ...RepositoriesFragment
    }
    ...RepositoryFragment
  }
`;

function Form({ className }: { className?: string }) {
  const [name, setName] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const data = useLazyLoadQuery<QueryType>(FormQuery, {});
  return (
    <div className={className}>
      <h2>Form</h2>
      {data.search && (
        <Repositories
          query={data.search}
          setName={(name: string) => setName(name)}
          setOwner={(owner: string) => setOwner(owner)}
        />
      )}
      {data && <Repository query={data} name={name} owner={owner} />}
    </div>
  );
}

export const StyledForm = styled(Form)``;

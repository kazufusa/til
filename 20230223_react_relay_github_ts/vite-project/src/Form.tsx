import { styled } from "@mui/material";
import { Repositories } from "./form/Repositories";
import { graphql } from "relay-runtime";
import { useLazyLoadQuery } from "react-relay";
import { type FormQuery as QueryType } from "./__generated__/FormQuery.graphql";

const FormQuery = graphql`
  query FormQuery {
    search(query: "relay", type: REPOSITORY, first: 10) {
      ...RepositoriesFragment
    }
    # https://relay.dev/docs/guided-tour/rendering/variables/#internaldocs-banner
    # repository(name: $name, owner: $owner) {
    #   collaborators(first: 3) {
    #     nodes {
    #       name
    #     }
    #   }
    # }
  }
`;

function Form({ className }: { className?: string }) {
  const data = useLazyLoadQuery<QueryType>(FormQuery, {});
  return (
    <div className={className}>
      <h2>Form</h2>
      {data.search && <Repositories query={data.search}/>}
    </div>
  );
}

export const StyledForm = styled(Form)``;

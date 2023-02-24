import { useMutation, graphql } from "react-relay";
import { AddStarButtonMutation } from "./__generated__/AddStarButtonMutation.graphql";

interface Props {
  starrableId: string;
}

const addStarButtonMutation = graphql`
  mutation AddStarButtonMutation($input: AddStarInput!) {
    addStar(input: $input) {
      starrable {
        ...StarComponent_star
      }
    }
  }
`;

export function AddStarButton({ starrableId }: Props) {
  const [commitMutation, isMutationInFlight] =
    useMutation<AddStarButtonMutation>(addStarButtonMutation);
  return (
    <button
      onClick={() =>
        commitMutation({
          variables: {
            input: {
              starrableId: starrableId,
            },
          },
        })
      }
      disabled={isMutationInFlight}
    >
      Add Star
    </button>
  );
}

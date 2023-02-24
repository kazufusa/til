import { useMutation, graphql } from "react-relay";
import { RemoveStarButtonMutation } from "./__generated__/RemoveStarButtonMutation.graphql";

interface Props {
  starrableId: string;
}

const removeStarButtonMutation = graphql`
  mutation RemoveStarButtonMutation($input: RemoveStarInput!) {
    removeStar(input: $input) {
      starrable {
        ...StarComponent_star
      }
    }
  }
`;

export function RemoveStarButton({ starrableId }: Props) {
  const [commitMutation, isMutationInFlight] =
    useMutation<RemoveStarButtonMutation>(removeStarButtonMutation);
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
      Remove Star
    </button>
  );
}

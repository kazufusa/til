# TypeScript Function Overloading

## Overview

Today, I explored the concept of function overloading in TypeScript. Function overloading allows us to have multiple function type under the same function name but with different parameter types or return types. This feature enhance the flexibility and readability of the code, allowing functions to handle different types of inputs and outputs efficiently.

## What I learned

In TypeScript, function overloading is achieved by specifing multiple function signatures for the same function. This approach lets us define how the function should behave with different types of arguments, providing a clearer contract for the function behavior.

## Key Concepts

- **Function Overloading**: Defining multiple signatures for a single function, each with different types or numbers of parameters.
- **Type Guards**: Utilizing conditional logic to ensure the correct types are used within the overloaded function body.

## Example Code

I wrote the following TypeScript code to practice function overloading. The example demonstrates how to create a single `convert` function that can handle different input and output structures based on whether a certain condition is True or False.

```typescript
type Input = {
  __typename: "input";
  values: string[];
};

type Output<T extends boolean> = {
  values: string[];
  score: T extends true ? number : null;
  id: T extends true ? string : null;
};

type Output1 = Output<true>;
type Output2 = Output<false>;

type Meta = { score: number, id: string }
function convert(input: Input, meta: Meta): Output1;
function convert(input: Input, meta: null): Output2;
function convert(
  input: input,
  meta: Meta | null,
): Output1 | Output2 {
    return {
      values: input.values,
      ...(meta ? meta : {score: null, id: null})
    };
}
```

## Explanation

- The function `convert` is overloaded with two signatures. One that takes a `Meta` object and returns `Output1`, and another that takes `null` as its second argument and returns `Output2`.
- The return type changes based on the presence of the `Meta` object, demonstrating how TypeScript's type system can be used to create flexible and type-safe functions.


## Conclusion

Learning about function overloading in TypeScript has significantly improved my understanding of how to write more flexible and type-safe funcitons. This feature will surely enhance the way I structure my code in future TypeScript projects.

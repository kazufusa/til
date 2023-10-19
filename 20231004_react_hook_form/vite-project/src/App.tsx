import { useForm, SubmitHandler } from "react-hook-form";
import "./App.css";
import React from "react";

type Inputs = {
  a: boolean;
  b: boolean;
  c: boolean;
  d: boolean;
};

function App() {
  const [formData, setFormData] = React.useState<string>("");
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    setValue,
  } = useForm<Inputs>({
    defaultValues: {
      a: true,
      b: true,
      c: false,
      d: false,
    },
  });
  const onSubmit: SubmitHandler<Inputs> = (data) => {
    console.log(data);
    setFormData(JSON.stringify(data));
  };

  const isChecked = watch("a", true) || watch("b", true);

  return (
    <>
      <Form />
      <p>{formData}</p>
      <form onSubmit={handleSubmit(onSubmit)}>
        a<input type="checkbox" {...register("a")} />
        b<input type="checkbox" {...register("b")} />
        check all
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(e) => {
            if (e.target.checked) {
              setValue("a", true);
              setValue("b", true);
            } else {
              setValue("a", false);
              setValue("b", false);
            }
          }}
        />
        {errors.a && <p>{errors.a.message}</p>}
        {errors.b && <p>{errors.b.message}</p>}
        <br />
        c<input type="checkbox" {...register("c")} />
        {errors.c && <p>{errors.c.message}</p>}
        <br />
        d<input type="checkbox" {...register("d")} />
        {errors.d && <p>{errors.d.message}</p>}
        <input type="submit" />
      </form>
    </>
  );
}

export default App;

const Candidates = ["a", "b", "c", "d"] as const;

type Candidate = (typeof Candidates)[number];

const multiSelections: {
  label: string;
  candidates: readonly Candidate[];
}[] = [
  {
    label: "a b",
    candidates: ["a", "b"],
  },
  {
    label: "c d",
    candidates: ["c", "d"],
  },
  {
    label: "all",
    candidates: Candidates,
  },
];

type Input2 = {
  checks: Candidate[];
  text: string;
  select: string;
};

function Form() {
  const [formData, setFormData] = React.useState<string>("");
  const [selectable, setSelectable] = React.useState<string[]>([]);
  React.useEffect(() => {
    const clear = setTimeout(() => setSelectable(["a", "b", "c", "d"]), 10000);
    return () => clearTimeout(clear);
  }, []);
  const {
    register,
    handleSubmit,
    watch,
    formState: {
      errors,
      isValid,
      touchedFields,
      isDirty,
      isSubmitted,
      isSubmitting,
    },
    setValue,
    trigger,
  } = useForm<Input2>({
    defaultValues: { checks: Candidates.map((v) => v) },
    mode: "onChange",
  });

  React.useEffect(() => {
    trigger();
  }, [trigger]);

  const onSubmit: SubmitHandler<Input2> = (data) => {
    setFormData(JSON.stringify(data));
  };

  const watchChecks = watch("checks");

  const checksProps = React.useMemo(
    () => ({
      ...register("checks", {
        validate: {
          atLeastOneRequired: (value: string[]) => {
            return value.length >= 1 || "1つ以上選択してください";
          },
        },
      }),
    }),
    [register],
  );

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div>
          <select
            {...register("select", { required: "入力は必須です" })}
            style={{ width: 150 }}
          >
            {selectable.length === 0 ? (
              <option value="">loading...</option>
            ) : (
              <option value="">選択してください</option>
            )}
            {selectable.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {touchedFields?.select && errors.select && (
            <p>{errors.select.message}</p>
          )}
        </div>
        <div>
          <input
            type="text"
            {...register("text", { required: "入力は必須です" })}
          />
          {touchedFields?.text && errors.text && <p>{errors.text.message}</p>}
        </div>
        <div>
          {Candidates.map((v) => (
            <div key={v}>
              <input key={v} value={v} type="checkbox" {...checksProps} />
              <label htmlFor={v}>{v}</label>
            </div>
          ))}
          <br />
          {multiSelections.map((ms) => (
            <div key={ms.label}>
              <input
                type="checkbox"
                id={ms.label}
                checked={watchChecks.some((v) => ms.candidates.includes(v))}
                onChange={(e) =>
                  setValue(
                    "checks",
                    e.target.checked
                      ? Array.from(new Set([...ms.candidates, ...watchChecks]))
                      : watchChecks.filter((v) => !ms.candidates.includes(v)),
                    { shouldValidate: true },
                  )
                }
              />
              <label htmlFor={ms.label}> {ms.label}</label>
            </div>
          ))}
        </div>
        {errors.checks && (
          <p>
            {errors.checks.type}:{errors.checks.message}
          </p>
        )}
        {isSubmitted && <p>{formData}</p>}
        <input type="submit" disabled={!isValid || isSubmitting} />
      </form>
    </>
  );
}

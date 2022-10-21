import React, { useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "react-query";

const queryClient = new QueryClient();

function App() {
  return (
    <div>
      <QueryClientProvider client={queryClient}>
        <TodoList></TodoList>
        <AddTodo></AddTodo>
      </QueryClientProvider>
    </div>
  );
}

type Todo = {
  name: string;
  status: "Todo" | "Doing" | "Done";
};

let todoList: Todo[] = [
  { name: "My todo", status: "Todo" },
  { name: "Already done", status: "Done" },
];

export const getTodoList = async () => {
  await new Promise((resolve) => {
    setTimeout(resolve, 1000);
  });
  return todoList;
};

export const addTodo = async (todo: Todo) => {
  todoList.push(todo);
  return todo;
};

const ChildCompnent: React.FC = () => {
  // 第二引数が無い場合はフェッチはせずキャッシュされた値が得られる
  const { data, error, isLoading } = useQuery("todoList");
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error! {error}</div>;
  if (data) return (
    <p>{`${data.length}個のタスクがあります.`}</p>
  )
}

const TodoList: React.FC = () => {
  const { data, error, isLoading } = useQuery("todoList", getTodoList);
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error! {error}</div>;
  if (data) {
    return (
      <>
        <h1>Todo List</h1>
        {data.map((todo) => (
          <div>
            <span>{todo.name},</span>
            <span>{todo.status}</span>
          </div>
        ))}
        <ChildCompnent />
      </>
    );
  }
  return <></>;
};

const AddTodo: React.FC = () => {
  const [todo, setTodo] = useState<Todo>({
    name: "",
    status: "Doing",
  });
  const queryClient = useQueryClient();
  const { mutate, isLoading } = useMutation({
    mutationFn: (todo: Todo) => {
      return addTodo(todo);
    },
    onSuccess: () => {
      queryClient.invalidateQueries("todoList");
    },    
  });
  return (
    <div>
      <h1>New todo</h1>
      <input
        name="name"
        value={todo?.name}
        onChange={(e) =>
          setTodo((todo) => ({
            ...todo,
            name: e.target.value,
          }))
        }
      ></input>
      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <button
          onClick={() => {
            todo && mutate(todo);
          }}
        >
          Add
        </button>
      )}
    </div>
  );
};

export default App;

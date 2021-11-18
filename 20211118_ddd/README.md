# About DDD

## Architecture of DDD

https://little-hands.hatenablog.com/entry/2018/12/10/ddd-architecture

1. Domain layer
    1. interfaces of Repository
    2. definitions of Entity, Value Object
    3. Domain Service: representations of domain knowledge
2. Use Caase layer(Application layer)
    1. Use Case:
        - create Entity or Value Object
        - use Repository to persist Entity or Value Object
        - translate Entity to the Value of Presentation layer
3. Infrastructure layer
    1. Repository: persists and searches Entity, and meets the interface defined in Domain layer
4. Application layer
    1. API endpoint
    2. ...etc


## What is the representation of Domain Knowledge?

https://little-hands.hatenablog.com/entry/2017/10/04/201201

### Bad Entity

```go
const (
  PostponeMaxCount = 3

  Undone TaskStatus = iota
  Done
)

type TaskStatus int

type Task struct {
  Id            int
  Status        TaskStatus
  Name          string
  DueDate       time.Time
  PostponeCount int
}

func (t *Task)CanPostpone() bool {
  return t.PostponeCount < PostponeMaxCount
}
```

### Why Bad Entity is Bad?

```go

var ErrTaskPostpone = errors.New("cannot postpone any longer")

type TaskApplication struct {
  taskRepo entity.TaskRepository
}

func (ta *TaskApplication) CreateTask(name string, dueData time.Time) error {
  task := &entity.Task{Status: entity.Undone, Name: name, DueDate: dueDate}
  _, err := ta.taskRepo.Save(task)
  return err
}

func (ta *TaskApplication) PostponeTask(taskId int) error {
  task, err := ta.taskRepo.FindById(taskId)
  if err != nil {
    return err
  }
  if !task.CanPostpone() {
    return ErrTaskPostpone
  }
  task.DueDate = task.DueDateu.Add(time.Day)
  task.PostponeCount ++
  _, err = ta.taskRepo.Save(task)
  return err
}

// ChangeTask can change name, dueDate, status freely, but these values should be constrainted by domain knowledge.
func (ta *TaskApplication) ChangeTask(taskId int, name string, dueDate time.Time, taskStatus entity.TaskStatus) error {
  task, err := ta.taskRepo.FindById(taskId)
  if err != nil {
    return err
  }
  task.Name = name
  task.DueDate = dueDate
  task.Status = taskStatus
  _, err = ta.taskRepo.Save(task)
  return err
}
```

### Good Entity

```go
var ErrTaskPostpone = errors.New("cannot postpone any longer")

type taskStatus int

const (
	PostponeMaxCount = 3

	Undone taskStatus = iota
	Done
)

type Task struct {
	Id            int
	status        taskStatus
	name          string
	dueDate       time.Time
	postponeCount int
}

func NewTask(name string, dueDate time.Time) *Task {
	return &Task{status: Undone, name: name, dueDate: dueDate}
}

func (t *Task) Name() string {
	return t.name
}

func (t *Task) DueDate() time.Time {
	return t.dueDate
}

func (t *Task) IsUndone() bool {
	return t.status == Undone
}

func (t *Task) Done() {
	t.status = Done
}

func (t *Task) Postpone() error {
	if PostponeMaxCount <= t.postponeCount {
		return ErrTaskPostpone
	}
	t.postponeCount++
	t.dueDate = t.dueDate.Add(time.Hour * 24)
	return nil
}
```

```go
type TaskApplication struct {
  taskRepo entity.TaskRepository
}

func (ta *TaskApplication) CreateTask(name string, dueData time.Time) error {
  task := &entity.NewTask(name, dueDate)
  _, err := ta.taskRepo.Save(task)
  return err
}

func (ta *TaskApplication) PostponeTask(taskId int) error {
  task, err := ta.taskRepo.FindById(taskId)
  if err != nil {
    return err
  }
  err = task.Postpone()
  if err != nil {
    return err
  }
  _, err = ta.taskRepo.Save(task)
  return err
}
```

## Consistency of Aggregations

https://little-hands.hatenablog.com/entry/2021/03/08/aggregation

### Example 1. Use Case updates aggregations

- Pros.
    1. symple and easy
- Cons.
    1. Use Case can break the consistency between Task and ActivityHistory(EvilTaskUseCase1)
    2. The domain knowledge of "When a Task created, an ActivityHistory is also created." is not implemented in Domain layer

```go
// domain/task/task.go
type Task struct {
  Name string
}

type TaskRepository interface {
  Insert (context.Context, *Task) error
}
```

```go
// domain/activity_history/activity_history.go
type ActivityHistory struct {
  Detail string
}

func NewActivityHistory(task *Task) *ActivityHistory {
  return &ActivityHistory{Detail: fmt.Sprintf("%s was created", task.Name)}
}

type ActivityHistoryRepository interface {
  Insert(context.Context, *ActivityHistory) error
}
```

```go
// domain/transaction/transaction.go
type Transaction interface {
  Do(func(context.Context) error) error
}
```

```go
// usecase/task/task.go
type CreateTaskUseCase1 struct {
  transaction         transaction.Transaction
  taskRepo            task.TaskRepository
  activityHistoryRepo activity_history.ActivityHistoryRepository
}


func (ct *CreateTaskUseCase) Execute(ctx context.Context, taskName string) error {
  ct.transaction.Do(ctx, func(ctx context.Context) {
    task := &task.Task{Name: taskName}
    err := ct.taskRepository.Insert(ctx, task)
    if err != nil {
      return err
    }
    activityHistory := activity_history.NewActivityHistory(task)
    err := ct.activityHistoryRepo.Insert(ctx, activityHistory)
    if err != nil {
      return err
    }
  })
}
```

```go
// usecase/task/task.go
type EvilTaskUseCase1 struct {
  transact           entity.Transaction
  taskRepo           entity.TaskRepository
  activityHistoryRepo entity.ActivityHistoryRepository
}


func (ct *CreateTaskUseCase) Execute(ctx context.Context, taskName string) error {
  return ct.transaction.Do(ctx, func(ctx context.Context) {
    task := &task.Task{Name: taskName}
    err := ct.taskRepository.Insert(ctx, task)
    if err != nil {
      return err
    }
    // Oops! ActivityHistory creation is forgotten!
  })
}
```

### Example 2. Use Domain Service

- Pros.
    1. Can implement the domain knowledge of "When a Task created, an ActivityHistory is also created." in Domain layer
- Cons.
    1. In this example, the responsibilities of the domain service tend to be vague and low cohesive.

```go
// usecase/task/task.go
type CreateTaskUseCase2 struct {
  taskCreator task.TaskCreator1
}

func (ct *CreateTaskUseCase) Execute(ctx context.Context, taskName string) error {
  return ct.taskCreator.Create(ctx, taskName)
}
```

```Go
// domain/task/task_creator.go
type TaskCreator1 struct {
  transaction         transaction.Transaction
  taskRepo            TaskRepository
  activityHistoryRepo activity_history.ActivityHistoryRepository
}

func (tc *TaskCreator1)Create(ctx context.Context, taskName string) error {
  return tc.transaction.Do(ctx, func(ctx context.Context) {
    task := &Task{Name: taskName}
    err := tc.taskRepository.Insert(ctx, task)
    if err != nil {
      return err
    }
    activityHistory := activity_history.NewActivityHistory(task)
    err := tc.activityHistoryRepo.Insert(ctx, activityHistory)
    if err != nil {
      return err
    }
  })
}
```


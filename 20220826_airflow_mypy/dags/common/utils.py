class Person(object):
    def __init__(self, name: str) -> None:
        self.name = name

    def hello(self) -> None:
        print(f"Hello, I am {self.name}.")


class Dog(object):
    def __init__(self) -> None:
        pass

    def bowwow(self) -> None:
        print("Bow wow!")

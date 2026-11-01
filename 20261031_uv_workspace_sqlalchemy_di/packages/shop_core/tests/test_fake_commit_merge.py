"""フェイクの commit は開始時との差だけを書き、その時点の共有の state に対して制約を調べる"""

import contextvars

import pytest

from shop_core import BusinessRuleError, Container, User
from shop_core.testing import InMemoryState, fake_backend


@pytest.fixture
def state():
    return InMemoryState()


@pytest.fixture
def container(state):
    c = Container()
    with fake_backend(c, state):
        yield c


def _user(email: str) -> User:
    return User(id=None, email=email, name=email)


def test_two_units_of_work_registering_different_users_both_persist(container, state):
    with container.uow() as a, container.uow() as b:
        ua = a.users.store(_user("a@example.com"))
        ub = b.users.store(_user("b@example.com"))
        a.commit()
        b.commit()
    assert sorted(u.email for u in state.users.values()) == ["a@example.com", "b@example.com"]
    # 採番は DB のシーケンスと同じく、トランザクション間で重ならない
    assert ua.id != ub.id


def test_second_commit_of_the_same_unique_email_is_rejected(container, state):
    with container.uow() as a, container.uow() as b:
        a.users.store(_user("dup@example.com"))
        b.users.store(_user("dup@example.com"))
        a.commit()
        with pytest.raises(BusinessRuleError) as ei:
            b.commit()
    assert ei.value.code == "user_email_taken"
    assert [u.email for u in state.users.values()] == ["dup@example.com"]


def test_rejected_commit_writes_nothing(container, state):
    with container.uow() as a, container.uow() as b:
        a.users.store(_user("dup@example.com"))
        b.users.store(_user("other@example.com"))
        b.users.store(_user("dup@example.com"))
        a.commit()
        with pytest.raises(BusinessRuleError):
            b.commit()
    assert [u.email for u in state.users.values()] == ["dup@example.com"]


def test_two_scopes_registering_different_users_both_persist(container, state):
    scope_a, scope_b = container.transaction(), container.transaction()
    ctx_a, ctx_b = contextvars.Context(), contextvars.Context()
    ctx_a.run(scope_a.__enter__)
    ctx_b.run(scope_b.__enter__)
    ctx_a.run(container.user_service().register, "a@example.com", "A")
    ctx_b.run(container.user_service().register, "b@example.com", "B")
    ctx_a.run(scope_a.__exit__, None, None, None)
    ctx_b.run(scope_b.__exit__, None, None, None)
    assert sorted(u.email for u in state.users.values()) == ["a@example.com", "b@example.com"]


def test_two_scopes_starting_an_execution_for_the_same_order_conflict(container, state):
    user = container.user_service().register("u@example.com", "U")
    pen = container.product_service().add("pen", 100, 5)
    order = container.order_service().place(user.id, [(pen.id, 1)])

    scope_a, scope_b = container.transaction(), container.transaction()
    ctx_a, ctx_b = contextvars.Context(), contextvars.Context()
    ctx_a.run(scope_a.__enter__)
    ctx_b.run(scope_b.__enter__)
    svc = container.execution_service()
    ctx_a.run(svc.start, order.id)
    ctx_b.run(svc.start, order.id)
    ctx_a.run(scope_a.__exit__, None, None, None)
    with pytest.raises(BusinessRuleError) as ei:
        ctx_b.run(scope_b.__exit__, None, None, None)
    assert ei.value.code == "execution_already_running"
    assert len(state.executions) == 1

"""Execution の楽観ロックと、レジストリの制約を本物の Postgres で検証する。TEST_DATABASE_URL がなければ skip"""

import contextvars
import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy import text

from shop_core import (
    BusinessRuleError,
    ConcurrentUpdateError,
    ExecutionNotRunningError,
    User,
    new_id,
    tables,
)
from shop_core.domain.constraints import CONSTRAINTS

pytestmark = pytest.mark.skipif(
    "TEST_DATABASE_URL" not in os.environ, reason="TEST_DATABASE_URL not set"
)


@pytest.fixture
def container(pg_container):
    return pg_container


@pytest.fixture
def order_id(container):
    user = container.user_service().register("a@example.com", "A")
    pen = container.product_service().add("pen", 100, 5)
    return container.order_service().place(user.id, [(pen.id, 1)]).id


def _version_in_db(container, execution_id) -> int:
    with container.engine().connect() as conn:
        return conn.scalar(
            text("select version from executions where id = :i"), {"i": execution_id}
        )


class TestOptimisticLock:
    def test_two_units_of_work_loading_the_same_version(self, container, order_id):
        e = container.execution_service().start(order_id)
        assert _version_in_db(container, e.id) == 0
        # 2 つの UoW が同じ版(0)を読む。先にコミットした側だけが通る
        with container.uow() as a, container.uow() as b:
            ea, eb = a.executions.resolve_by_id(e.id), b.executions.resolve_by_id(e.id)
            assert ea.version == eb.version == 0
            ea.complete([])
            assert a.executions.store(ea).version == 1
            a.commit()
            eb.fail("x")
            with pytest.raises(ConcurrentUpdateError) as ei:
                b.executions.store(eb)
        assert ei.value.code == "execution_concurrent_update"
        got = container.execution_service().get(e.id)
        assert (got.status, got.version) == ("done", 1)

    def test_unchanged_store_bumps_version_and_conflicts_with_stale_copy(
        self, container, order_id
    ):
        e = container.execution_service().start(order_id)
        with container.uow() as uow:
            stale = uow.executions.resolve_by_id(e.id)
        with container.uow() as uow:
            fresh = uow.executions.resolve_by_id(e.id)
            assert uow.executions.store(fresh).version == 1  # 変更なしでも UPDATE が出る
            uow.commit()
        assert _version_in_db(container, e.id) == 1
        with container.uow() as uow:
            with pytest.raises(ConcurrentUpdateError):
                uow.executions.store(stale)

    def test_conflict_while_row_is_locked_by_another_transaction(self, container, order_id):
        # A が未コミットで UPDATE している間に B が同じ版を読んで保存すると、
        # 行ロックを待ったあとに版が変わっていて StaleDataError -> ConcurrentUpdateError になる
        e = container.execution_service().start(order_id)
        with container.uow() as b:
            eb = b.executions.resolve_by_id(e.id)
            eb.fail("x")
            with ThreadPoolExecutor(1) as pool:
                with container.uow() as a:
                    ea = a.executions.resolve_by_id(e.id)
                    ea.complete([])
                    a.executions.store(ea)  # ここで行ロックを取る
                    # ワーカースレッドに ContextVar(サービスの中という印)は伝わらないので、コピーして渡す
                    fut = pool.submit(contextvars.copy_context().run, _store_expecting_conflict, b, eb)
                    a.commit()
                assert fut.result(timeout=10) is True

    def test_idempotent_complete_leaves_version_unchanged(self, container, order_id):
        svc = container.execution_service()
        e = svc.start(order_id)
        ids = [new_id()]
        assert svc.complete(e.id, ids).version == 1
        # 冪等な再呼び出しは保存しないので、版は上がらない
        assert svc.complete(e.id, ids).version == 1
        assert svc.get(e.id).version == 1

    def test_idempotent_fail_leaves_version_unchanged(self, container, order_id):
        svc = container.execution_service()
        e = svc.start(order_id)
        assert svc.fail(e.id, "boom").version == 1
        assert svc.fail(e.id, "boom").version == 1
        assert svc.get(e.id).version == 1

    def test_expected_version_mismatch_conflicts_before_any_change(self, container, order_id):
        svc = container.execution_service()
        e = svc.start(order_id)
        with pytest.raises(ConcurrentUpdateError) as ei:
            svc.complete(e.id, [new_id()], expected_version=5)
        assert ei.value.code == "execution_concurrent_update"
        with pytest.raises(ConcurrentUpdateError):
            svc.fail(e.id, "x", expected_version=5)
        got = svc.get(e.id)
        assert (got.status, got.version) == ("running", 0)

    def test_expected_version_match_succeeds(self, container, order_id):
        svc = container.execution_service()
        e = svc.start(order_id)
        done = svc.complete(e.id, [new_id()], expected_version=e.version)
        assert (done.status, done.version) == ("done", 1)

    def test_expected_version_match_succeeds_for_fail(self, container, order_id):
        svc = container.execution_service()
        e = svc.start(order_id)
        failed = svc.fail(e.id, "boom", expected_version=0)
        assert (failed.status, failed.version) == ("failed", 1)

    def test_tables_alias_insert_defaults_version_to_zero(self, container, order_id):
        eid = new_id()
        with container.transaction() as tx:
            tx.session.add(tables.Execution(id=eid, order_id=order_id, status="done"))
        assert _version_in_db(container, eid) == 0
        assert container.execution_service().get(eid).version == 0


def _store_expecting_conflict(uow, execution) -> bool:
    try:
        uow.executions.store(execution)
    except ConcurrentUpdateError:
        return True
    return False


def test_concurrent_complete_has_one_winner(container, order_id):
    svc = container.execution_service()
    allowed = (ConcurrentUpdateError, ExecutionNotRunningError)
    for _ in range(15):
        e = _start_fresh(container, order_id)
        ids = [[new_id()], [new_id()]]
        barrier = Barrier(2)

        def run(image_ids):
            barrier.wait()
            try:
                return svc.complete(e.id, image_ids)
            except Exception as exc:  # noqa: BLE001
                return exc

        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(run, ids))
        winners = [(r, i) for r, i in zip(results, ids) if not isinstance(r, Exception)]
        losers = [r for r in results if isinstance(r, Exception)]
        # 負けた側は競合か、勝ちのあとに読んで実行中でなかった、のどちらか。他の型は出ない
        assert len(winners) == 1, results
        assert len(losers) == 1 and isinstance(losers[0], allowed), losers
        got = svc.get(e.id)
        assert got.status == "done"
        assert [i.id for i in got.images] == [i for i in winners[0][1]]
        assert got.version == 1


def _start_fresh(container, order_id):
    """実行中は注文ごとに 1 つなので、前の回のものを終わらせてから始める"""
    svc = container.execution_service()
    for old in _running(container, order_id):
        svc.fail(old, "next round")
    return svc.start(order_id)


def _running(container, order_id):
    with container.uow() as uow:
        return [e.id for e in uow.executions.resolve_by_order_id(order_id) if e.status == "running"]


class TestSharedConstraints:
    def test_second_running_execution_for_same_order(self, container, order_id):
        svc = container.execution_service()
        svc.start(order_id)
        with pytest.raises(BusinessRuleError) as ei:
            svc.start(order_id)
        assert ei.value.code == "execution_already_running"

    @pytest.mark.parametrize("finish", ["complete", "fail"])
    def test_new_start_is_allowed_after_finish(self, container, order_id, finish):
        svc = container.execution_service()
        first = svc.start(order_id)
        if finish == "complete":
            svc.complete(first.id, [new_id()])
        else:
            svc.fail(first.id, "boom")
        assert svc.start(order_id).id != first.id

    def test_duplicate_email_via_tables(self, container):
        container.user_service().register("a@example.com", "A")
        with pytest.raises(BusinessRuleError) as ei:
            with container.transaction() as tx:
                tx.session.add(tables.User(email="a@example.com", name="B"))
        assert ei.value.code == "user_email_taken"

    def test_duplicate_email_via_repository_store(self, container):
        container.user_service().register("a@example.com", "A")
        with pytest.raises(BusinessRuleError) as ei:
            with container.uow() as uow:
                uow.users.store(User(id=None, email="a@example.com", name="B"))
        assert ei.value.code == "user_email_taken"


@pytest.mark.parametrize("constraint", CONSTRAINTS, ids=lambda c: c.name)
def test_registered_name_exists_in_catalog(container, constraint):
    """レジストリの名前がマイグレーションと食い違っていないか。ここは create_all ではなく alembic の結果を見る"""
    from conftest import migrate_to_head

    url = os.environ["TEST_DATABASE_URL"]
    migrate_to_head(url)
    with container.engine().connect() as conn:
        found = conn.scalar(
            text(
                "select count(*) from ("
                " select conname as n from pg_constraint where connamespace = 'shop'::regnamespace"
                " union all"
                " select indexname from pg_indexes where schemaname = 'shop') t where n = :n"
            ),
            {"n": constraint.name},
        )
    assert found >= 1, f"{constraint.name} is not in the catalog"

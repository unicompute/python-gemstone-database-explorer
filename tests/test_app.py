"""Basic smoke tests for gemstone-p routes (no live GemStone required)."""

import json
import unittest
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import gemstone_p.app as app_module
from gemstone_p import __version__
import gemstone_p.session  # Ensure patch("gemstone_p.session...") resolves normally.
from gemstone_py import GemStoneConfig as RealGemStoneConfig
from gemstone_py._gci import _is_smallint, _smallint_to_python
from gemstone_py.client import OopRef


def _mock_session():
    session = MagicMock()
    session.eval.return_value = "object"
    session.eval_oop.return_value = 12345
    session.perform_oop.return_value = 12345
    session.perform.return_value = "MockObject"
    session.resolve.return_value = 12345
    session.int_oop.return_value = 12345
    return session


@contextmanager
def _mock_request_session(session, **kwargs):
    yield session


class TestRoutes(unittest.TestCase):
    def setUp(self):
        # Patch GemStoneConfig so init_app doesn't need real env vars
        patcher = patch("gemstone_p.session.GemStoneConfig")
        mock_config_cls = patcher.start()
        mock_config_cls.from_env.return_value = MagicMock()
        self.addCleanup(patcher.stop)

        from gemstone_p.app import create_app
        self.app = create_app()
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    def test_index_returns_html(self):
        r = self.client.get("/")
        self.assertEqual(r.status_code, 200)
        self.assertIn(b"GemStone Database Explorer", r.data)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_ids(self, mock_rs):
        mock_rs.return_value = _mock_request_session(_mock_session())
        r = self.client.get("/ids")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertIn("persistentRootId", data)
        self.assertIn("defaultWorkspaceId", data)

    @patch("gemstone_p.app.subprocess.run")
    @patch("gemstone_p.app.gs_session.connection_snapshot")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_connection_preflight_suggests_local_stone_fix(self, mock_rs, mock_snapshot, mock_run):
        session = _mock_session()
        session.eval.side_effect = ["3.7.5", "3.7.5"]
        mock_rs.return_value = _mock_request_session(session)
        mock_snapshot.return_value = {
            "configured": True,
            "stone": "gs64stone",
            "host": "localhost",
            "netldi": "50377",
            "gemService": "gemnetobject",
            "libPath": "/opt/gemstone/product/lib",
            "username": "tariq",
            "passwordSet": True,
            "hostUsernameSet": False,
            "hostPasswordSet": False,
            "stoneSource": "default",
            "mode": "local-stone-name",
            "effectiveTarget": "gs64stone",
        }
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=(
                "Status        Version    Owner       Pid   Port   Started     Type       Name\n"
                "-------      --------- --------- -------- ----- ------------ ------      ----\n"
                "OK           3.7.5     tariq        49597 50377 Apr 25 20:38 Netldi      gs64ldi\n"
                "OK           3.7.5     tariq        49692 52185 Apr 25 20:39 Stone       seaside\n"
            ),
            stderr="",
        )

        r = self.client.get("/connection/preflight")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertIn(data["status"], {"ok", "error"})
        self.assertEqual(data["connection"]["probe"]["availableStones"], ["seaside"])
        self.assertEqual(data["connection"]["probe"]["availableNetldis"][0]["port"], "50377")
        self.assertEqual(data["connection"]["suggestions"][0]["shell"], "export GS_STONE=seaside")

    @patch("gemstone_p.app.subprocess.run")
    @patch("gemstone_p.app.gs_session.connection_snapshot")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_ids_failure_includes_preflight_payload(self, mock_rs, mock_snapshot, mock_run):
        mock_rs.side_effect = RuntimeError("login failed")
        mock_snapshot.return_value = {
            "configured": True,
            "stone": "gs64stone",
            "host": "localhost",
            "netldi": "50377",
            "gemService": "gemnetobject",
            "libPath": "/opt/gemstone/product/lib",
            "username": "tariq",
            "passwordSet": True,
            "hostUsernameSet": False,
            "hostPasswordSet": False,
            "stoneSource": "default",
            "mode": "local-stone-name",
            "effectiveTarget": "gs64stone",
        }
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=(
                "Status        Version    Owner       Pid   Port   Started     Type       Name\n"
                "-------      --------- --------- -------- ----- ------------ ------      ----\n"
                "OK           3.7.5     tariq        49597 50377 Apr 25 20:38 Netldi      gs64ldi\n"
                "OK           3.7.5     tariq        49692 52185 Apr 25 20:39 Stone       seaside\n"
            ),
            stderr="",
        )

        r = self.client.get("/ids")
        self.assertEqual(r.status_code, 500)
        data = json.loads(r.data)
        self.assertFalse(data["success"])
        self.assertEqual(data["error"], "login failed")
        self.assertEqual(data["preflight"]["status"], "error")
        self.assertEqual(data["preflight"]["connection"]["probe"]["availableStones"], ["seaside"])
        self.assertEqual(data["preflight"]["connection"]["suggestions"][0]["env"]["GS_STONE"], "seaside")

    @patch("gemstone_p.app.subprocess.run")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_connection_preflight_honors_request_override_headers(self, mock_rs, mock_run):
        gemstone_p.session._BROKER._config = RealGemStoneConfig(
            stone="gs64stone",
            netldi="50377",
            host="localhost",
            username="tariq",
            password="secret",
        )
        session = _mock_session()
        session.eval.side_effect = ["3.7.5", "3.7.5"]
        mock_rs.return_value = _mock_request_session(session)
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=(
                "Status        Version    Owner       Pid   Port   Started     Type       Name\n"
                "-------      --------- --------- -------- ----- ------------ ------      ----\n"
                "OK           3.7.5     tariq        49597 50377 Apr 25 20:38 Netldi      gs64ldi\n"
                "OK           3.7.5     tariq        49692 52185 Apr 25 20:39 Stone       seaside\n"
            ),
            stderr="",
        )

        r = self.client.get("/connection/preflight", headers={"X-GS-Stone": "seaside"})
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertEqual(data["connection"]["configured"]["stone"], "seaside")
        self.assertEqual(data["connection"]["configured"]["stoneSource"], "request-override")
        self.assertTrue(data["connection"]["configured"]["overrideActive"])
        self.assertEqual(data["connection"]["configured"]["override"]["stone"], "seaside")
        self.assertFalse(any(item.get("kind") == "stone-name" for item in data["connection"]["suggestions"]))

    @patch("gemstone_p.app.gs_session.request_session")
    def test_version_includes_app_and_runtime_versions(self, mock_rs):
        session = _mock_session()
        session.eval.side_effect = ["3.7.5", "3.7.5"]
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/version")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["app"], __version__)
        self.assertEqual(data["stone"], "3.7.5")
        self.assertEqual(data["gem"], "3.7.5")

    @patch("gemstone_p.app.gs_session.request_session")
    def test_maglev_loaded_features_report(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "Loaded Features Report\n\n1. app/models/user.rb\n2. config/environment.rb\n"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/maglev/report/loaded-features")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertTrue(data["available"])
        self.assertEqual(data["reportKey"], "loaded-features")
        self.assertEqual(data["title"], "Loaded Features Report")
        self.assertIn("app/models/user.rb", data["text"])

    def test_maglev_report_unknown_key_returns_404(self):
        r = self.client.get("/maglev/report/unknown")
        self.assertEqual(r.status_code, 404)
        data = json.loads(r.data)
        self.assertFalse(data["success"])
        self.assertFalse(data["available"])
        self.assertEqual(data["reportKey"], "unknown")

    @patch("gemstone_p.app.gs_session.request_session")
    def test_healthz_includes_ok_status_and_runtime_versions(self, mock_rs):
        session = _mock_session()
        session.eval.side_effect = ["3.7.5", "3.7.5"]
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/healthz")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["app"], __version__)
        self.assertEqual(data["stone"], "3.7.5")
        self.assertEqual(data["gem"], "3.7.5")

    @patch("gemstone_p.app.gs_session.broker_snapshot")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_diagnostics_includes_runtime_and_broker_snapshot(self, mock_rs, mock_snapshot):
        session = _mock_session()
        session.eval.side_effect = ["3.7.5", "3.7.5"]
        mock_rs.return_value = _mock_request_session(session)
        mock_snapshot.return_value = {
            "defaultAutoBegin": None,
            "managedSessionCount": 2,
            "channels": [{"name": "object:win-1-r", "hasSession": True, "loggedIn": True}],
        }
        r = self.client.get("/diagnostics")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["app"], __version__)
        self.assertEqual(data["stone"], "3.7.5")
        self.assertEqual(data["gem"], "3.7.5")
        self.assertEqual(data["sessionBroker"]["managedSessionCount"], 2)
        self.assertEqual(data["sessionBroker"]["channels"][0]["name"], "object:win-1-r")
        self.assertIn("python", data["runtime"])
        self.assertIn("platform", data["runtime"])

    @patch("gemstone_p.app.gs_session.broker_snapshot")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_diagnostics_honors_request_override_headers(self, mock_rs, mock_snapshot):
        gemstone_p.session._BROKER._config = RealGemStoneConfig(
            stone="gs64stone",
            netldi="50377",
            host="localhost",
            username="tariq",
            password="secret",
        )
        session = _mock_session()
        session.eval.side_effect = ["3.7.5", "3.7.5"]
        mock_rs.return_value = _mock_request_session(session)
        mock_snapshot.return_value = {
            "defaultAutoBegin": None,
            "managedSessionCount": 1,
            "channels": [{"name": "roots-r", "hasSession": True, "loggedIn": True}],
        }
        r = self.client.get("/diagnostics", headers={"X-GS-Stone": "seaside"})
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertEqual(data["connection"]["configured"]["stone"], "seaside")
        self.assertEqual(data["connection"]["configured"]["stoneSource"], "request-override")
        self.assertTrue(data["connection"]["configured"]["overrideActive"])
        self.assertEqual(data["connection"]["configured"]["override"]["stone"], "seaside")

    @patch("gemstone_p.app.gs_session.request_session")
    def test_object_index(self, mock_rs):
        mock_rs.return_value = _mock_request_session(_mock_session())
        r = self.client.get("/object/index/12345")
        self.assertEqual(r.status_code, 200)

    @patch("gemstone_p.app.object_view")
    @patch("gemstone_p.app.eval_in_context")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_object_evaluate_exception_includes_debugger_metadata(self, mock_rs, mock_eval_in_context, mock_object_view):
        session = _mock_session()
        mock_rs.return_value = _mock_request_session(session)
        mock_eval_in_context.return_value = {
            "isException": True,
            "resultOop": 555,
            "errorText": "a ZeroDivide occurred (error 2026)",
            "debugThreadOop": 700,
            "exceptionOop": 555,
        }
        mock_object_view.return_value = {
            "oop": 555,
            "inspection": "a ZeroDivide occurred (error 2026), reason:numErrIntDivisionByZero, attempt to divide 1 by zero",
            "basetype": "object",
            "loaded": False,
        }

        r = self.client.post(
            "/object/evaluate/20",
            json={"code": "1/0", "language": "smalltalk", "depth": 1},
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertTrue(data["result"][0])
        self.assertEqual(data["result"][1]["debugThreadOop"], 700)
        self.assertEqual(data["result"][1]["debugExceptionOop"], 555)
        self.assertEqual(data["result"][1]["sourcePreview"], "1/0")
        self.assertIn("ZeroDivide", data["result"][1]["exceptionText"])
        self.assertTrue(data["result"][1]["autoOpenDebugger"])
        mock_eval_in_context.assert_called_once_with(session, 20, "1/0", "smalltalk")
        mock_object_view.assert_called_once()
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

    @patch("gemstone_p.app.gs_session.request_session")
    def test_transaction_commit(self, mock_rs):
        mock_rs.return_value = _mock_request_session(_mock_session())
        r = self.client.post("/transaction/commit", json={})
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["result"], "committed")

    @patch("gemstone_p.app.gs_session.request_session")
    def test_transaction_abort(self, mock_rs):
        mock_rs.return_value = _mock_request_session(_mock_session())
        r = self.client.post("/transaction/abort", json={})
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["result"], "aborted")

    @patch("gemstone_p.app.gs_session.request_session")
    def test_transaction_continue_returns_result(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "continued"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post("/transaction/continue", json={})
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["result"], "continued")
        script = session.eval.call_args[0][0]
        self.assertIn("System continueTransaction", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_transaction_continue_surfaces_smalltalk_errors(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "error: cannot continue"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post("/transaction/continue", json={})
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertFalse(data["success"])
        self.assertEqual(data["exception"], "cannot continue")

    @patch("gemstone_p.app.gs_session.request_session")
    def test_transaction_persistent_mode_reads_backend_state(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "#autoBegin"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/transaction/persistent-mode")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertTrue(data["persistent"])
        script = session.eval.call_args[0][0]
        self.assertIn("System transactionMode printString", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_transaction_set_persistent_mode_returns_result_and_state(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "#autoBegin"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post("/transaction/persistent-mode", json={"enable": True})
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertTrue(data["persistent"])
        self.assertEqual(data["result"], "Persistent mode enabled")
        script = session.eval.call_args[0][0]
        self.assertIn("System transactionMode: #autoBegin", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_transaction_set_persistent_mode_surfaces_smalltalk_errors(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "error: no permission"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post("/transaction/persistent-mode", json={"enable": False})
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertFalse(data["success"])
        self.assertEqual(data["exception"], "no permission")

    @patch("gemstone_p.app.gs_session.request_session")
    def test_symbol_list_users(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "DataCurator\nSystemUser\n"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/symbol-list/users")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["users"], ["DataCurator", "SystemUser"])
        script = session.eval.call_args[0][0]
        self.assertIn("([u userId] on: Error do: [:e | u printString]) asString", script)
        self.assertNotIn("[[u userId]", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_symbol_list_dictionaries(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "UserGlobals\nGlobals\n"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/symbol-list/dictionaries/DataCurator")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["dictionaries"], ["UserGlobals", "Globals"])
        script = session.eval.call_args[0][0]
        self.assertIn("([d name] on: Error do: [:e | d printString]) asString", script)
        self.assertNotIn("[[d name]", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_symbol_list_entries(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "Foo\nBar\n"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/symbol-list/entries/DataCurator/UserGlobals")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["entries"], ["Foo", "Bar"])

    @patch("gemstone_p.app.gs_session.request_session")
    def test_code_selectors_use_behavior_and_parse_categories(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "C|accessing|bar\nC|accessing|foo\nA|foo\nA|bar\n"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/code/selectors/12345")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["result"]["accessing"], ["bar", "foo"])
        self.assertEqual(data["result"]["(all Smalltalk)"], ["bar", "foo"])
        script = session.eval.call_args[0][0]
        self.assertIn("obj isBehavior", script)
        self.assertIn("behavior selectors asArray", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_code_source_uses_behavior_lookup(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "printString source"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/code/code/12345?selector=printString")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["result"], "printString source")
        script = session.eval.call_args[0][0]
        self.assertIn("obj isBehavior", script)
        self.assertIn("compiledMethodAt: 'printString' asSymbol", script)
        self.assertIn("lookupSelector: 'printString' asSymbol", script)

    @patch("gemstone_p.app._debug_object_ref")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_constants_use_behavior_class_pool(self, mock_rs, mock_debug_object_ref):
        session = _mock_session()
        session.eval.return_value = "25\nFoo\tBehavior\t310\n"
        mock_rs.return_value = _mock_request_session(session)
        mock_debug_object_ref.return_value = {"oop": 310, "inspection": "Behavior", "basetype": "class", "loaded": False}
        r = self.client.get("/object/constants/12345?limit=20&offset=0")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["constants"], [{
            "key": "Foo",
            "value": "Behavior",
            "valueObject": {"oop": 310, "inspection": "Behavior", "basetype": "class", "loaded": False},
        }])
        self.assertEqual(data["limit"], 20)
        self.assertEqual(data["offset"], 0)
        self.assertEqual(data["total"], 25)
        self.assertTrue(data["hasMore"])
        mock_debug_object_ref.assert_called_once_with(session, "310", "Behavior")
        script = session.eval.call_args[0][0]
        self.assertIn("obj isBehavior", script)
        self.assertIn("behavior classPool associations asArray", script)
        self.assertIn("start := 0 + 1.", script)
        self.assertIn("stop := total min: (0 + 20).", script)
        self.assertIn("value asOop printString", script)
        self.assertIn("Character tab asString", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_stone_version_report_uses_system_report(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "gsVersion|'3.7.5'\n"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/object/stone-version-report")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["report"], [{"key": "gsVersion", "value": "'3.7.5'"}])
        script = session.eval.call_args[0][0]
        self.assertIn("System stoneVersionReport keysAndValuesDo:", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_object_hierarchy_returns_exact_class_refs_and_dictionaries(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "ProtoObject\t302\tGlobals\nObject\t300\tGlobals\n"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/object/hierarchy/12345")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["hierarchy"], [
            {
                "class": {"oop": 302, "inspection": "ProtoObject", "basetype": "class", "loaded": False},
                "dictionary": "Globals",
            },
            {
                "class": {"oop": 300, "inspection": "Object", "basetype": "class", "loaded": False},
                "dictionary": "Globals",
            },
        ])
        script = session.eval.call_args[0][0]
        self.assertIn("rows addFirst:", script)
        self.assertIn("dict at: clsName asSymbol ifAbsent: [nil]", script)
        self.assertIn("value == cls", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_object_instances_supports_offset_and_total(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "45\n521\tObject instance #21\n522\tObject instance #22\n"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/object/instances/12345?limit=2&offset=20")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["instances"], [
            {"oop": 521, "printString": "Object instance #21"},
            {"oop": 522, "printString": "Object instance #22"},
        ])
        self.assertEqual(data["limit"], 2)
        self.assertEqual(data["offset"], 20)
        self.assertEqual(data["total"], 45)
        self.assertTrue(data["hasMore"])
        script = session.eval.call_args[0][0]
        self.assertIn("total := [col size]", script)
        self.assertIn("start := 20 + 1.", script)
        self.assertIn("stop := total min: (20 + 2).", script)
        self.assertIn("lines add: ((encode value: instOop)", script)

    @patch("gemstone_p.app._debug_object_ref")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_object_included_modules_supports_offset_and_owner_context(self, mock_rs, mock_debug_object_ref):
        session = _mock_session()
        session.eval.return_value = "25\n300\tObject\t601\tModule1\n310\tBehavior\t602\tModule2\n"
        mock_rs.return_value = _mock_request_session(session)
        mock_debug_object_ref.side_effect = [
            {"oop": 300, "inspection": "Object", "basetype": "class", "loaded": False},
            {"oop": 601, "inspection": "Module1", "basetype": "module", "loaded": False},
            {"oop": 310, "inspection": "Behavior", "basetype": "class", "loaded": False},
            {"oop": 602, "inspection": "Module2", "basetype": "module", "loaded": False},
        ]
        r = self.client.get("/object/included-modules/12345?limit=2&offset=0")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["modules"], [
            {
                "owner": {"oop": 300, "inspection": "Object", "basetype": "class", "loaded": False},
                "module": {"oop": 601, "inspection": "Module1", "basetype": "module", "loaded": False},
            },
            {
                "owner": {"oop": 310, "inspection": "Behavior", "basetype": "class", "loaded": False},
                "module": {"oop": 602, "inspection": "Module2", "basetype": "module", "loaded": False},
            },
        ])
        self.assertEqual(data["limit"], 2)
        self.assertEqual(data["offset"], 0)
        self.assertEqual(data["total"], 25)
        self.assertTrue(data["hasMore"])
        script = session.eval.call_args[0][0]
        self.assertIn("behavior withAllSuperclasses do:", script)
        self.assertIn("cls includedModules do:", script)
        self.assertIn("rows add: ((encode value: clsOop)", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_dictionaries(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "UserGlobals\nGlobals\n"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/class-browser/dictionaries")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["dictionaries"], ["UserGlobals", "Globals"])
        script = session.eval.call_args[0][0]
        self.assertIn("System myUserProfile symbolList do:", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_add_dictionary_uses_mutating_session(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|TmpUI"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post("/class-browser/add-dictionary", json={"name": "TmpUI"})
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["dictionary"], "TmpUI")
        self.assertEqual(data["result"], "Added TmpUI")
        script = session.eval.call_args[0][0]
        self.assertIn("sym := System myUserProfile symbolList.", script)
        self.assertIn("existing := [sym objectNamed: dictName asSymbol] on: Error do: [:e | nil].", script)
        self.assertIn("newDict := SymbolDictionary new.", script)
        self.assertIn("sym add: newDict.", script)
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_rename_dictionary_uses_mutating_session(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|TmpUI2"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/rename-dictionary",
            json={"dictionary": "TmpUI", "targetDictionary": "TmpUI2"},
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["dictionary"], "TmpUI2")
        self.assertEqual(data["result"], "Renamed TmpUI to TmpUI2")
        script = session.eval.call_args[0][0]
        self.assertIn("dict := [sym objectNamed: oldName asSymbol] on: Error do: [:e | nil].", script)
        self.assertIn("sym removeKey: oldName asSymbol ifAbsent: [].", script)
        self.assertIn("sym at: newName asSymbol put: dict.", script)
        self.assertIn("[dict name: newName asString] on: Error do: [:e | ].", script)
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_remove_dictionary_uses_mutating_session(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|TmpUI"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post("/class-browser/remove-dictionary", json={"dictionary": "TmpUI"})
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["dictionary"], "TmpUI")
        self.assertEqual(data["result"], "Removed TmpUI")
        script = session.eval.call_args[0][0]
        self.assertIn("existing := [sym objectNamed: dictName asSymbol] on: Error do: [:e | nil].", script)
        self.assertIn("sym removeKey: dictName asSymbol ifAbsent: [].", script)
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_inspect_target_for_dictionary(self, mock_rs):
        session = _mock_session()
        session.eval_oop.return_value = 100
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post("/class-browser/inspect-target", json={"mode": "dictionary", "dictionary": "Globals"})
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["oop"], 100)
        self.assertEqual(data["label"], "Globals")
        self.assertEqual(session.eval_oop.call_args[0][0], "(System myUserProfile symbolList objectNamed: 'Globals' asSymbol)")

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_inspect_target_for_class(self, mock_rs):
        session = _mock_session()
        session.eval_oop.return_value = 301
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/inspect-target",
            json={"mode": "class", "className": "Object", "dictionary": "Globals", "meta": True},
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["oop"], 301)
        self.assertEqual(data["label"], "Object class")
        self.assertIn("ifNil: [nil] ifNotNil: [:cls | cls class]", session.eval_oop.call_args[0][0])

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_inspect_target_for_method(self, mock_rs):
        session = _mock_session()
        session.eval_oop.return_value = 940
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/inspect-target",
            json={
                "mode": "method",
                "className": "Object",
                "dictionary": "Globals",
                "selector": "printString",
                "meta": False,
            },
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["oop"], 940)
        self.assertEqual(data["label"], "Object >> printString")
        self.assertIn("compiledMethodAt: 'printString' asSymbol ifAbsent: [nil]", session.eval_oop.call_args[0][0])

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_inspect_target_for_instances(self, mock_rs):
        session = _mock_session()
        session.eval_oop.return_value = 930
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/inspect-target",
            json={"mode": "instances", "className": "Object", "dictionary": "Globals"},
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["oop"], 930)
        self.assertEqual(data["label"], "Object allInstances")
        self.assertEqual(session.eval_oop.call_args[0][0], "(((System myUserProfile symbolList objectNamed: 'Globals' asSymbol) at: 'Object' asSymbol ifAbsent: [nil]) allInstances)")

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_class_location_returns_all_matches(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "Globals\nUserGlobals\n"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/class-browser/class-location?class=Object")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["dictionary"], "")
        self.assertEqual(data["matches"], [
            {"className": "Object", "dictionary": "Globals"},
            {"className": "Object", "dictionary": "UserGlobals"},
        ])
        script = session.eval.call_args[0][0]
        self.assertIn("dict includesKey: 'Object' asSymbol", script)
        self.assertIn("rows add: (encode value: dictName)", script)
        self.assertIn("rows asSortedCollection do:", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_classes(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "Object\nBehavior\n"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/class-browser/classes?dictionary=UserGlobals")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["classes"], ["Object", "Behavior"])
        script = session.eval.call_args[0][0]
        self.assertIn("objectNamed: 'UserGlobals' asSymbol", script)
        self.assertIn("classNames := dict keys select:", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_categories_for_class_side(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "accessing\ninitialization\n"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/class-browser/categories?class=Object&dictionary=Globals&meta=1")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["categories"], ["-- all --", "accessing", "initialization"])
        script = session.eval.call_args[0][0]
        self.assertIn("objectNamed: 'Globals' asSymbol) at: 'Object' asSymbol ifAbsent: [nil]", script)
        self.assertIn("ifNil: [nil] ifNotNil: [:cls | cls class]", script)
        self.assertIn("cls categoryNames", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_source_for_method(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "printString ^ 'ok'"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/class-browser/source?class=Object&dictionary=Globals&selector=printString")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["source"], "printString ^ 'ok'")
        script = session.eval.call_args[0][0]
        self.assertIn("objectNamed: 'Globals' asSymbol) at: 'Object' asSymbol ifAbsent: [nil]", script)
        self.assertIn("compiledMethodAt: 'printString' asSymbol", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_versions_include_method_oops(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "version 1|printString ^ 'old'|940\n"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/class-browser/versions?class=Object&dictionary=Globals&selector=printString")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["versions"], [{
            "label": "version 1",
            "source": "printString ^ 'old'",
            "methodOop": 940,
        }])
        script = session.eval.call_args[0][0]
        self.assertIn("method asOop printString", script)
        self.assertIn("compiledMethodAt: sel ifAbsent: [nil]", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_query_implementors(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "Globals|Object|0|printString\nGlobals|Behavior|0|printString\n"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/class-browser/query?selector=printString&mode=implementors&rootClassName=Object&rootDictionary=Globals&hierarchyScope=sub")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["results"], [
            {"label": "Behavior>>printString", "className": "Behavior", "selector": "printString", "meta": False, "dictionary": "Globals"},
            {"label": "Object>>printString", "className": "Object", "selector": "printString", "meta": False, "dictionary": "Globals"},
        ])
        script = session.eval.call_args[0][0]
        self.assertIn("candidate asString = token", script)
        self.assertIn("scope := 'sub'", script)
        self.assertIn("rootClass := ((System myUserProfile symbolList objectNamed: 'Globals' asSymbol) at: 'Object' asSymbol ifAbsent: [nil])", script)
        self.assertIn("dictName := ([[dict name] on: Error do: [:e | dict printString]] asString)", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_query_class_side_implementors(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "Globals|Object|1|new\n"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/class-browser/query?selector=new&mode=implementors&rootClassName=Object&rootDictionary=Globals&meta=1")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["results"], [
            {"label": "Object class>>new", "className": "Object", "selector": "new", "meta": True, "dictionary": "Globals"},
        ])
        script = session.eval.call_args[0][0]
        self.assertIn("queryMeta := true.", script)
        self.assertIn("rootClass := (((System myUserProfile symbolList objectNamed: 'Globals' asSymbol) at: 'Object' asSymbol ifAbsent: [nil]) ifNil: [nil] ifNotNil: [:cls | cls class]).", script)
        self.assertIn("cls := queryMeta ifTrue: [v class] ifFalse: [v].", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_query_method_text(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "Globals|Object|0|printString\n"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/class-browser/query?selector=hello&mode=methodText")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["results"], [
            {"label": "Object>>printString", "className": "Object", "selector": "printString", "meta": False, "dictionary": "Globals"},
        ])
        script = session.eval.call_args[0][0]
        self.assertIn("includesSubstring: token", script)
        self.assertNotIn("candidate asString = token", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_hierarchy_returns_class_names_with_dictionaries(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "ProtoObject\tGlobals\nObject\tUserGlobals\n"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/class-browser/hierarchy?class=Object&dictionary=UserGlobals")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["hierarchy"], [
            {"className": "ProtoObject", "dictionary": "Globals"},
            {"className": "Object", "dictionary": "UserGlobals"},
        ])
        script = session.eval.call_args[0][0]
        self.assertIn("objectNamed: 'UserGlobals' asSymbol) at: 'Object' asSymbol ifAbsent: [nil]", script)
        self.assertIn("dict at: clsName asSymbol ifAbsent: [nil]", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_compile_uses_mutating_session(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|displayString|testing|printString|Success"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/compile",
            json={
                "className": "Object",
                "dictionary": "Globals",
                "category": "testing",
                "selector": "printString",
                "source": "displayString ^ 1",
                "meta": True,
            },
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["result"], "Success")
        self.assertEqual(data["selector"], "displayString")
        self.assertEqual(data["category"], "testing")
        self.assertEqual(data["previousSelector"], "printString")
        script = session.eval.call_args[0][0]
        self.assertIn("objectNamed: 'Globals' asSymbol) at: 'Object' asSymbol ifAbsent: [nil]", script)
        self.assertIn("ifNil: [nil] ifNotNil: [:cls | cls class]", script)
        self.assertIn("oldSel := 'printString' asSymbol.", script)
        self.assertIn("compileMethod: source category: 'testing' asSymbol", script)
        self.assertIn("newSel := [ compileResult selector ] on: Error do: [ nil ].", script)
        self.assertIn("cls removeSelector: oldSel", script)
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_compile_rejects_class_definition_source(self, mock_rs):
        r = self.client.post(
            "/class-browser/compile",
            json={
                "className": "Object",
                "dictionary": "Globals",
                "category": "-- all --",
                "selector": "",
                "source": "Object subclass: #NewClass",
                "meta": False,
                "sourceKind": "classDefinition",
            },
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertFalse(data["success"])
        self.assertIn("browse-only", data["exception"])
        mock_rs.assert_not_called()

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_add_class_uses_mutating_session(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|WidgetThing|Globals|Behavior"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/add-class",
            json={
                "className": "WidgetThing",
                "dictionary": "Globals",
                "superclassName": "Behavior",
                "superclassDictionary": "Globals",
            },
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["className"], "WidgetThing")
        self.assertEqual(data["dictionary"], "Globals")
        self.assertEqual(data["superclassName"], "Behavior")
        self.assertEqual(data["result"], "Created WidgetThing in Globals")
        script = session.eval.call_args[0][0]
        self.assertIn("dict := (System myUserProfile symbolList objectNamed: 'Globals' asSymbol).", script)
        self.assertIn("super := ((System myUserProfile symbolList objectNamed: 'Globals' asSymbol) at: 'Behavior' asSymbol ifAbsent: [nil]).", script)
        self.assertIn("subclass: 'WidgetThing' asSymbol", script)
        self.assertIn("inDictionary: dict", script)
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_rename_class_uses_mutating_session(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|WidgetModel|Globals"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/rename-class",
            json={
                "className": "WidgetThing",
                "dictionary": "Globals",
                "targetClassName": "WidgetModel",
            },
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["className"], "WidgetModel")
        self.assertEqual(data["dictionary"], "Globals")
        self.assertEqual(data["result"], "Renamed WidgetThing to WidgetModel")
        script = session.eval.call_args[0][0]
        self.assertIn("dict := (System myUserProfile symbolList objectNamed: 'Globals' asSymbol).", script)
        self.assertIn("cls := ((System myUserProfile symbolList objectNamed: 'Globals' asSymbol) at: 'WidgetThing' asSymbol ifAbsent: [nil]).", script)
        self.assertIn("existing := [dict at: 'WidgetModel' asSymbol ifAbsent: [nil]] on: Error do: [:e | nil].", script)
        self.assertIn("cls rename: 'WidgetModel'.", script)
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_move_class_uses_mutating_session(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|WidgetThing|UserGlobals"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/move-class",
            json={
                "className": "WidgetThing",
                "dictionary": "Globals",
                "targetDictionary": "UserGlobals",
            },
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["className"], "WidgetThing")
        self.assertEqual(data["dictionary"], "UserGlobals")
        self.assertEqual(data["result"], "Moved WidgetThing to UserGlobals")
        script = session.eval.call_args[0][0]
        self.assertIn("oldDict := (System myUserProfile symbolList objectNamed: 'Globals' asSymbol).", script)
        self.assertIn("newDict := (System myUserProfile symbolList objectNamed: 'UserGlobals' asSymbol).", script)
        self.assertIn("oldDict removeKey: 'WidgetThing' asSymbol ifAbsent: []", script)
        self.assertIn("newDict at: 'WidgetThing' asSymbol put: cls", script)
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_remove_class_uses_mutating_session(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|WidgetThing"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/remove-class",
            json={
                "className": "WidgetThing",
                "dictionary": "Globals",
            },
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["className"], "WidgetThing")
        self.assertEqual(data["result"], "Removed WidgetThing")
        script = session.eval.call_args[0][0]
        self.assertIn("cls := ((System myUserProfile symbolList objectNamed: 'Globals' asSymbol) at: 'WidgetThing' asSymbol ifAbsent: [nil]).", script)
        self.assertIn("cls removeFromSystem", script)
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_move_method_uses_mutating_session(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|printString|formatting"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/move-method",
            json={
                "className": "Behavior",
                "dictionary": "Globals",
                "selector": "printString",
                "category": "formatting",
                "meta": False,
            },
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["selector"], "printString")
        self.assertEqual(data["category"], "formatting")
        self.assertEqual(data["result"], "Moved printString to formatting")
        script = session.eval.call_args[0][0]
        self.assertIn("compiledMethodAt: 'printString' asSymbol ifAbsent: [nil]", script)
        self.assertIn("compileMethod: src category: targetCategory asSymbol", script)
        self.assertIn("targetCategory := 'formatting'.", script)
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_remove_method_uses_mutating_session(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|printString"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/remove-method",
            json={
                "className": "Behavior",
                "dictionary": "Globals",
                "selector": "printString",
                "meta": False,
            },
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["selector"], "printString")
        self.assertEqual(data["result"], "Removed printString")
        script = session.eval.call_args[0][0]
        self.assertIn("includesSelector: 'printString' asSymbol", script)
        self.assertIn("removeSelector: 'printString' asSymbol", script)
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_remove_category_uses_mutating_session(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|1|as yet unclassified"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/remove-category",
            json={
                "className": "Object",
                "dictionary": "Globals",
                "category": "printing",
                "meta": False,
            },
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["category"], "as yet unclassified")
        self.assertEqual(data["movedCount"], 1)
        self.assertEqual(data["result"], "Moved 1 method to as yet unclassified")
        script = session.eval.call_args[0][0]
        self.assertIn("sels := [cls selectorsIn: 'printing' asSymbol] on: Error do: [:e | #()].", script)
        self.assertIn("compileResult := cls compileMethod: src category: targetCategory asSymbol.", script)
        self.assertIn("targetCategory := 'as yet unclassified'.", script)
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_add_category_uses_mutating_session(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|utility"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/add-category",
            json={
                "className": "Object",
                "dictionary": "Globals",
                "category": "utility",
                "meta": False,
            },
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["category"], "utility")
        self.assertEqual(data["result"], "Added category utility")
        script = session.eval.call_args[0][0]
        self.assertIn("cls := ((System myUserProfile symbolList objectNamed: 'Globals' asSymbol) at: 'Object' asSymbol ifAbsent: [nil]).", script)
        self.assertIn("existing := [[cls categoryNames collect: [:each | each asString]] on: Error do: [:e | #()]].", script)
        self.assertIn("cls addCategory: categoryName asSymbol", script)
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_rename_category_uses_mutating_session(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|2|utility"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/rename-category",
            json={
                "className": "Object",
                "dictionary": "Globals",
                "category": "printing",
                "targetCategory": "utility",
                "meta": False,
            },
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["category"], "utility")
        self.assertEqual(data["movedCount"], 2)
        self.assertEqual(data["result"], "Renamed printing to utility")
        script = session.eval.call_args[0][0]
        self.assertIn("sels := [cls selectorsIn: 'printing' asSymbol] on: Error do: [:e | #()].", script)
        self.assertIn("compileResult := cls compileMethod: src category: targetCategory asSymbol.", script)
        self.assertIn("targetCategory := 'utility'.", script)
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_add_instance_variable_uses_mutating_session(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|slotOne"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/add-instance-variable",
            json={
                "className": "Object",
                "dictionary": "Globals",
                "variableName": "slotOne",
            },
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["variableName"], "slotOne")
        self.assertEqual(data["result"], "Added instance variable slotOne")
        script = session.eval.call_args[0][0]
        self.assertIn("target addInstVarName: 'slotOne' asSymbol.", script)
        self.assertIn("target respondsTo: #addInstVarName:", script)
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_add_class_variable_uses_mutating_session(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|SharedState"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/add-class-variable",
            json={
                "className": "Object",
                "dictionary": "Globals",
                "variableName": "SharedState",
            },
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["variableName"], "SharedState")
        self.assertEqual(data["result"], "Added class variable SharedState")
        script = session.eval.call_args[0][0]
        self.assertIn("target addClassVarName: 'SharedState' asSymbol.", script)
        self.assertIn("target respondsTo: #addClassVarName:", script)
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_add_class_instance_variable_uses_mutating_session(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|cachedState"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/add-class-instance-variable",
            json={
                "className": "Object",
                "dictionary": "Globals",
                "variableName": "cachedState",
            },
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["variableName"], "cachedState")
        self.assertEqual(data["result"], "Added class instance variable cachedState")
        script = session.eval.call_args[0][0]
        self.assertIn("target addInstVarName: 'cachedState' asSymbol.", script)
        self.assertIn("target respondsTo: #addInstVarName:", script)
        self.assertIn("target := cls ifNil: [nil] ifNotNil: [:base | base class].", script)
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_rename_instance_variable_uses_mutating_session(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|slotOne|slotTwo"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/rename-instance-variable",
            json={
                "className": "Object",
                "dictionary": "Globals",
                "variableName": "slotOne",
                "targetVariableName": "slotTwo",
            },
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["variableName"], "slotOne")
        self.assertEqual(data["targetVariableName"], "slotTwo")
        self.assertEqual(data["result"], "Renamed instance variable slotOne to slotTwo")
        script = session.eval.call_args[0][0]
        self.assertIn("target addInstVarName: 'slotTwo' asSymbol.", script)
        self.assertIn("target removeInstVar: 'slotOne'.", script)
        self.assertIn("target respondsTo: #removeInstVar:", script)
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_remove_instance_variable_uses_mutating_session(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|slotOne"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/remove-instance-variable",
            json={
                "className": "Object",
                "dictionary": "Globals",
                "variableName": "slotOne",
            },
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["result"], "Removed instance variable slotOne")
        script = session.eval.call_args[0][0]
        self.assertIn("target removeInstVar: 'slotOne'.", script)
        self.assertIn("target respondsTo: #removeInstVar:", script)
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_rename_class_variable_uses_mutating_session(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|SharedState|RenamedState"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/rename-class-variable",
            json={
                "className": "Object",
                "dictionary": "Globals",
                "variableName": "SharedState",
                "targetVariableName": "RenamedState",
            },
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["result"], "Renamed class variable SharedState to RenamedState")
        script = session.eval.call_args[0][0]
        self.assertIn("target addClassVarName: 'RenamedState' asSymbol.", script)
        self.assertIn("target removeClassVarName: 'SharedState'.", script)
        self.assertIn("target respondsTo: #removeClassVarName:", script)
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_remove_class_variable_uses_mutating_session(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|SharedState"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/remove-class-variable",
            json={
                "className": "Object",
                "dictionary": "Globals",
                "variableName": "SharedState",
            },
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["result"], "Removed class variable SharedState")
        script = session.eval.call_args[0][0]
        self.assertIn("target removeClassVarName: 'SharedState'.", script)
        self.assertIn("target respondsTo: #removeClassVarName:", script)
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_rename_class_instance_variable_uses_mutating_session(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|cachedState|renamedCache"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/rename-class-instance-variable",
            json={
                "className": "Object",
                "dictionary": "Globals",
                "variableName": "cachedState",
                "targetVariableName": "renamedCache",
            },
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["result"], "Renamed class instance variable cachedState to renamedCache")
        script = session.eval.call_args[0][0]
        self.assertIn("target addInstVarName: 'renamedCache' asSymbol.", script)
        self.assertIn("target removeInstVar: 'cachedState'.", script)
        self.assertIn("target := cls ifNil: [nil] ifNotNil: [:base | base class].", script)
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_remove_class_instance_variable_uses_mutating_session(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|cachedState"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/remove-class-instance-variable",
            json={
                "className": "Object",
                "dictionary": "Globals",
                "variableName": "cachedState",
            },
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["result"], "Removed class instance variable cachedState")
        script = session.eval.call_args[0][0]
        self.assertIn("target removeInstVar: 'cachedState'.", script)
        self.assertIn("target := cls ifNil: [nil] ifNotNil: [:base | base class].", script)
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_file_out_class(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "Object definition\n\nprintString ^ 'ok'\n"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/class-browser/file-out?mode=class&class=Object&dictionary=Globals")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["filename"], "Object.st")
        self.assertIn("printString", data["source"])
        script = session.eval.call_args[0][0]
        self.assertIn("cls := ((System myUserProfile symbolList objectNamed: 'Globals' asSymbol) at: 'Object' asSymbol ifAbsent: [nil]).", script)
        self.assertIn("cls selectors asSortedCollection do:", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_file_out_method(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "printString ^ 'ok'\n"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/class-browser/file-out?mode=method&class=Object&dictionary=Globals&selector=printString")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["filename"], "Object-printString.st")
        self.assertEqual(data["source"], "printString ^ 'ok'\n")
        script = session.eval.call_args[0][0]
        self.assertIn("cls := ((System myUserProfile symbolList objectNamed: 'Globals' asSymbol) at: 'Object' asSymbol ifAbsent: [nil]).", script)
        self.assertIn("compiledMethodAt: 'printString' asSymbol", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_create_accessors_uses_mutating_session(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "Success"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/create-accessors",
            json={"className": "Object", "dictionary": "Globals", "variableName": "name"},
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["result"], "Success")
        self.assertEqual(data["category"], "accessing")
        self.assertEqual(data["getterSelector"], "name")
        self.assertEqual(data["setterSelector"], "name:")
        script = session.eval.call_args[0][0]
        self.assertIn("objectNamed: 'Globals' asSymbol) at: 'Object' asSymbol ifAbsent: [nil]", script)
        self.assertIn("getter := 'name", script)
        self.assertIn("setter := 'name: anObject", script)
        self.assertIn("compileMethod: getter category: 'accessing' asSymbol", script)
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

    @patch("gemstone_p.app.object_view")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_threads_returns_exception_summary_and_source_preview(self, mock_rs, mock_object_view):
        session = _mock_session()
        session.eval.return_value = "700|a HaltedDemoProcess|a ZeroDivide occurred (error 2026)|1/0"
        mock_rs.return_value = _mock_request_session(session)

        r = self.client.get("/debug/threads")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(len(data["threads"]), 1)
        self.assertEqual(data["threads"][0]["oop"], 700)
        self.assertEqual(data["threads"][0]["printString"], "a HaltedDemoProcess")
        self.assertEqual(data["threads"][0]["exceptionText"], "a ZeroDivide occurred (error 2026)")
        self.assertEqual(data["threads"][0]["sourcePreview"], "1/0")
        self.assertEqual(data["threads"][0]["displayText"], "1/0")
        script = session.eval.call_args[0][0]
        self.assertIn("threadStorage", script)
        self.assertIn("suspendedContext", script)
        self.assertIn("exceptionText", script)
        mock_object_view.assert_not_called()

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_threads_uses_source_hint_when_backend_preview_is_empty(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "700|a HaltedDemoProcess|a ZeroDivide occurred (error 2026)|"
        mock_rs.return_value = _mock_request_session(session)

        with patch.dict("gemstone_p.app._DEBUG_SOURCE_HINTS", {700: "1/0"}, clear=True):
            r = self.client.get("/debug/threads")

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["threads"][0]["sourcePreview"], "1/0")
        self.assertEqual(data["threads"][0]["displayText"], "1/0")

    @patch("gemstone_p.app.object_view")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_frame_returns_object_refs(self, mock_rs, mock_object_view):
        session = _mock_session()
        session.eval.return_value = "Behavior>>helper|17|Behavior|310|helper ^ #done|8|2|result\t77"
        mock_rs.return_value = _mock_request_session(session)
        mock_object_view.side_effect = [
            {"oop": 310, "inspection": "Behavior", "basetype": "class", "loaded": False},
            {"oop": 77, "inspection": "#done", "basetype": "symbol", "loaded": False},
        ]

        r = self.client.get("/debug/frame/700?index=1")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["selfObject"]["inspection"], "Behavior")
        self.assertEqual(data["variables"][0]["name"], "result")
        self.assertEqual(data["variables"][0]["value"], "#done")
        self.assertEqual(data["variables"][0]["valueObject"]["inspection"], "#done")
        self.assertEqual(data["sourceOffset"], 8)
        self.assertEqual(data["stepPoint"], 2)
        self.assertEqual(data["lineNumber"], 1)
        script = session.eval.call_args[0][0]
        self.assertIn("receiver := [[detail at: 2]", script)
        self.assertIn("tempNames := [[detail at: 7]", script)
        self.assertIn("stepValue := [detail at: 5]", script)
        self.assertIn("offsets := [[detail at: 6]", script)
        mock_object_view.assert_any_call(session, 310, depth=0)
        mock_object_view.assert_any_call(session, 77, depth=0)

    @patch("gemstone_p.app.object_view")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_frame_uses_debugger_report_source_fallbacks(self, mock_rs, mock_object_view):
        session = _mock_session()
        session.eval.return_value = "Behavior>>helper|17|Behavior|310|helper ^ #done|8|2|result\t77"
        mock_rs.return_value = _mock_request_session(session)
        mock_object_view.side_effect = [
            {"oop": 310, "inspection": "Behavior", "basetype": "class", "loaded": False},
            {"oop": 77, "inspection": "#done", "basetype": "symbol", "loaded": False},
        ]

        r = self.client.get("/debug/frame/700?index=1")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["source"], "helper ^ #done")
        script = session.eval.call_args[0][0]
        self.assertIn("proc _gsiStackReportFromLevel: frameLevel toLevel: frameLevel", script)
        self.assertIn("detail := [proc _gsiDebuggerDetailedReportAt: frameLevel]", script)
        self.assertIn("source := [[detail at: 9]", script)
        self.assertIn("tempNames := [[detail at: 7]", script)
        self.assertIn("ctx := [proc suspendedContext]", script)
        self.assertIn("ctx sourceCode", script)
        self.assertIn("ctx sourceString", script)
        self.assertIn("ctx receiver", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_frames_uses_context_chain_labels(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "0|Object>>haltedMethod\n1|Behavior>>helper"
        mock_rs.return_value = _mock_request_session(session)

        r = self.client.get("/debug/frames/700")

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(len(data["frames"]), 2)
        self.assertEqual(data["frames"][0]["name"], "Object>>haltedMethod")
        self.assertEqual(data["frames"][0]["className"], "Object")
        self.assertEqual(data["frames"][0]["selectorName"], "haltedMethod")
        self.assertEqual(data["frames"][0]["frameKey"], "Object>>haltedMethod")
        self.assertFalse(data["frames"][0]["isExecutedCode"])
        self.assertEqual(data["frames"][1]["name"], "Behavior>>helper")
        self.assertEqual(data["frames"][1]["frameKey"], "Behavior>>helper")
        script = session.eval.call_args[0][0]
        self.assertIn("ctx := [proc suspendedContext]", script)
        self.assertIn("ownerName := [[receiver class name asString]", script)
        self.assertIn("selectorName := [[[ctx method] selector asString]", script)
        self.assertIn("ctx := [ctx sender]", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_frames_uses_executed_code_label_when_source_hint_is_available(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "0|Object>>haltedMethod\n1|Behavior>>helper"
        mock_rs.return_value = _mock_request_session(session)

        with patch.dict("gemstone_p.app._DEBUG_SOURCE_HINTS", {700: "1+1.\n1/0"}, clear=True):
            r = self.client.get("/debug/frames/700")

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["frames"][0]["name"], "Executed code @1 line 1")
        self.assertTrue(data["frames"][0]["isExecutedCode"])
        self.assertEqual(data["frames"][0]["frameKey"], "executed:Object>>haltedMethod")
        self.assertEqual(data["frames"][1]["name"], "Behavior>>helper")

    @patch("gemstone_p.app.object_view")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_frame_uses_source_hint_when_backend_source_is_empty(self, mock_rs, mock_object_view):
        session = _mock_session()
        session.eval.return_value = "doIt|17|Behavior|310||0|0|"
        mock_rs.return_value = _mock_request_session(session)
        mock_object_view.return_value = {"oop": 310, "inspection": "Behavior", "basetype": "class", "loaded": False}

        with patch.dict("gemstone_p.app._DEBUG_SOURCE_HINTS", {700: "1/0"}, clear=True):
            r = self.client.get("/debug/frame/700?index=0")

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["methodName"], "Executed code @1 line 1")
        self.assertEqual(data["className"], "")
        self.assertEqual(data["selectorName"], "")
        self.assertTrue(data["isExecutedCode"])
        self.assertEqual(data["frameKey"], "executed-code")
        self.assertEqual(data["source"], "1/0")
        self.assertEqual(data["stepPoint"], 1)
        self.assertEqual(data["lineNumber"], 1)
        self.assertEqual(data["status"], "suspended")
        self.assertTrue(data["isLiveSession"])
        self.assertTrue(data["canStep"])
        self.assertTrue(data["canProceed"])
        self.assertTrue(data["canRestart"])
        self.assertTrue(data["canTrim"])
        self.assertTrue(data["canTerminate"])
        self.assertTrue(data["canStepInto"])
        self.assertTrue(data["canStepOver"])
        self.assertTrue(data["canStepReturn"])

    @patch("gemstone_p.app.object_view")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_frame_live_uses_executed_code_label_when_source_hint_is_available(self, mock_rs, mock_object_view):
        session = _mock_session()
        mock_rs.return_value = _mock_request_session(session)
        mock_object_view.return_value = {"oop": 310, "inspection": "an Object", "basetype": "object", "loaded": False}

        def decode_smallint(raw):
            value = int(raw)
            return int(_smallint_to_python(value)) if _is_smallint(value) else value

        def perform(receiver, selector, *args):
            receiver = int(receiver)
            decoded_args = tuple(decode_smallint(arg) for arg in args)
            if receiver == 700 and selector == "suspendedContext":
                return OopRef(701, session)
            if receiver == 701 and selector == "sender":
                return OopRef(702, session)
            if receiver == 702 and selector == "sender":
                return None
            if receiver == 701 and selector == "receiver":
                return OopRef(310, session)
            if receiver == 702 and selector == "receiver":
                return OopRef(320, session)
            if receiver == 310 and selector == "class":
                return OopRef(311, session)
            if receiver == 320 and selector == "class":
                return OopRef(321, session)
            if receiver == 311 and selector == "name":
                return "SigWorkspaceEvaluator"
            if receiver == 321 and selector == "name":
                return "Behavior"
            if receiver == 701 and selector == "method":
                return OopRef(711, session)
            if receiver == 702 and selector == "method":
                return OopRef(721, session)
            if receiver == 711 and selector == "selector":
                return "sigWorkspace123"
            if receiver == 721 and selector == "selector":
                return "helper"
            if receiver == 701 and selector == "printString":
                return "SigWorkspaceEvaluator>>sigWorkspace123"
            if receiver == 702 and selector == "printString":
                return "Behavior>>helper"
            if receiver == 700 and selector == "_gsiDebuggerDetailedReportAt:":
                return OopRef(801 if decoded_args[0] == 1 else 811, session)
            if receiver == 801 and selector == "at:":
                index = decoded_args[0]
                if index == 5:
                    return 1
                if index == 6:
                    return OopRef(802, session)
                if index == 9:
                    return ""
                return None
            if receiver == 802 and selector == "at:":
                return 1 if decoded_args[0] == 1 else None
            if receiver == 811 and selector == "at:":
                index = decoded_args[0]
                if index == 5:
                    return 2
                if index == 6:
                    return OopRef(812, session)
                if index == 9:
                    return "helper ^ #done"
                return None
            if receiver == 812 and selector == "at:":
                return 8 if decoded_args[0] == 2 else None
            if selector == "printString":
                return ""
            return None

        session.perform.side_effect = perform

        with patch.dict("gemstone_p.app._DEBUG_SOURCE_HINTS", {700: "1+1.\n1/0"}, clear=True):
            frame_response = self.client.get("/debug/frame/700?index=0")

        self.assertEqual(frame_response.status_code, 200)
        frame_data = json.loads(frame_response.data)
        self.assertTrue(frame_data["success"])
        self.assertEqual(frame_data["methodName"], "Executed code @1 line 1")
        self.assertEqual(frame_data["className"], "SigWorkspaceEvaluator")
        self.assertEqual(frame_data["selectorName"], "sigWorkspace123")
        self.assertEqual(frame_data["frameKey"], "executed:SigWorkspaceEvaluator>>sigWorkspace123")
        self.assertTrue(frame_data["isExecutedCode"])
        self.assertEqual(frame_data["source"], "1+1.\n1/0")
        self.assertEqual(frame_data["stepPoint"], 1)
        self.assertEqual(frame_data["lineNumber"], 1)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_frames_live_does_not_relabel_non_workspace_top_frame_as_executed_code(self, mock_rs):
        session = _mock_session()
        mock_rs.return_value = _mock_request_session(session)
        wrapper_source = "sigWorkspaceTop\n^ [\n1+1.\n1/0\n] value"
        primitive_source = "/ aNumber\n\"Returns the result of dividing the receiver by aNumber.\"\n<primitive: 10>"

        def decode_smallint(raw):
            value = int(raw)
            return int(_smallint_to_python(value)) if _is_smallint(value) else value

        def perform(receiver, selector, *args):
            receiver = int(receiver)
            decoded_args = tuple(decode_smallint(arg) for arg in args)
            if receiver == 700 and selector == "suspendedContext":
                return OopRef(701, session)
            if receiver == 701 and selector == "sender":
                return OopRef(702, session)
            if receiver == 702 and selector == "sender":
                return None
            if receiver == 701 and selector == "receiver":
                return OopRef(310, session)
            if receiver == 702 and selector == "receiver":
                return OopRef(900, session)
            if receiver == 310 and selector == "class":
                return OopRef(311, session)
            if receiver == 900 and selector == "class":
                return OopRef(901, session)
            if receiver == 311 and selector == "name":
                return "SmallInteger"
            if receiver == 901 and selector == "name":
                return "SigWorkspaceEvaluator"
            if receiver == 701 and selector == "method":
                return OopRef(711, session)
            if receiver == 702 and selector == "method":
                return OopRef(721, session)
            if receiver == 711 and selector == "selector":
                return "/"
            if receiver == 721 and selector == "selector":
                return "sigWorkspaceTop"
            if receiver == 701 and selector == "printString":
                return "SmallInteger>>/"
            if receiver == 702 and selector == "printString":
                return "SigWorkspaceEvaluator>>sigWorkspaceTop"
            if receiver == 700 and selector == "_gsiDebuggerDetailedReportAt:":
                return OopRef(801 if decoded_args[0] == 1 else 811, session)
            if receiver == 801 and selector == "at:":
                index = decoded_args[0]
                if index == 5:
                    return 6
                if index == 6:
                    return OopRef(802, session)
                if index == 9:
                    return primitive_source
                return None
            if receiver == 802 and selector == "at:":
                return 85 if decoded_args[0] == 6 else None
            if receiver == 811 and selector == "at:":
                index = decoded_args[0]
                if index == 5:
                    return 3
                if index == 6:
                    return OopRef(812, session)
                if index == 9:
                    return wrapper_source
                return None
            if receiver == 812 and selector == "at:":
                return 26 if decoded_args[0] == 3 else None
            if selector == "printString":
                return ""
            return None

        session.perform.side_effect = perform

        with patch.dict("gemstone_p.app._DEBUG_SOURCE_HINTS", {700: "1+1.\n1/0"}, clear=True):
            frames_response = self.client.get("/debug/frames/700")

        self.assertEqual(frames_response.status_code, 200)
        frames_data = json.loads(frames_response.data)
        self.assertTrue(frames_data["success"])
        self.assertEqual(frames_data["frames"][0]["name"], "SmallInteger>>/")
        self.assertEqual(frames_data["frames"][0]["frameKey"], "SmallInteger>>/")
        self.assertEqual(frames_data["frames"][1]["name"], "Executed code @3 line 2")
        self.assertEqual(frames_data["frames"][1]["frameKey"], "executed:SigWorkspaceEvaluator>>sigWorkspaceTop")
        self.assertTrue(frames_data["frames"][1]["isExecutedCode"])

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_frames_live_uses_source_hint_to_normalize_top_frame_list_entry(self, mock_rs):
        session = _mock_session()
        mock_rs.return_value = _mock_request_session(session)

        def decode_smallint(raw):
            value = int(raw)
            return int(_smallint_to_python(value)) if _is_smallint(value) else value

        def perform(receiver, selector, *args):
            receiver = int(receiver)
            decoded_args = tuple(decode_smallint(arg) for arg in args)
            if receiver == 700 and selector == "suspendedContext":
                return OopRef(701, session)
            if receiver == 701 and selector == "sender":
                return OopRef(702, session)
            if receiver == 702 and selector == "sender":
                return None
            if receiver == 701 and selector == "receiver":
                return OopRef(310, session)
            if receiver == 702 and selector == "receiver":
                return OopRef(320, session)
            if receiver == 310 and selector == "class":
                return OopRef(311, session)
            if receiver == 320 and selector == "class":
                return OopRef(321, session)
            if receiver == 311 and selector == "name":
                return "SigWorkspaceEvaluator"
            if receiver == 321 and selector == "name":
                return "Behavior"
            if receiver == 701 and selector == "method":
                return OopRef(711, session)
            if receiver == 702 and selector == "method":
                return OopRef(721, session)
            if receiver == 711 and selector == "selector":
                return "sigWorkspace123"
            if receiver == 721 and selector == "selector":
                return "helper"
            if receiver == 701 and selector == "printString":
                return "SigWorkspaceEvaluator>>sigWorkspace123"
            if receiver == 702 and selector == "printString":
                return "Behavior>>helper"
            if receiver == 700 and selector == "_gsiDebuggerDetailedReportAt:":
                return OopRef(801 if decoded_args[0] == 1 else 811, session)
            if receiver == 801 and selector == "at:":
                index = decoded_args[0]
                if index == 5:
                    return 1
                if index == 6:
                    return OopRef(802, session)
                if index == 9:
                    return ""
                return None
            if receiver == 802 and selector == "at:":
                return 1 if decoded_args[0] == 1 else None
            if receiver == 811 and selector == "at:":
                index = decoded_args[0]
                if index == 5:
                    return 2
                if index == 6:
                    return OopRef(812, session)
                if index == 9:
                    return "helper ^ #done"
                return None
            if receiver == 812 and selector == "at:":
                return 8 if decoded_args[0] == 2 else None
            if selector == "printString":
                return ""
            return None

        session.perform.side_effect = perform

        with patch.dict("gemstone_p.app._DEBUG_SOURCE_HINTS", {700: "1+1.\n1/0"}, clear=True):
            frames_response = self.client.get("/debug/frames/700")

        self.assertEqual(frames_response.status_code, 200)
        frames_data = json.loads(frames_response.data)
        self.assertTrue(frames_data["success"])
        self.assertEqual(frames_data["frames"][0]["name"], "Executed code @1 line 1")
        self.assertEqual(frames_data["frames"][0]["frameKey"], "executed:SigWorkspaceEvaluator>>sigWorkspace123")
        self.assertTrue(frames_data["frames"][0]["isExecutedCode"])
        self.assertEqual(frames_data["frames"][1]["name"], "Behavior>>helper")
        self.assertEqual(frames_data["frames"][1]["frameKey"], "Behavior>>helper")

    @patch("gemstone_p.app.object_view")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_frame_live_normalizes_workspace_wrapper_offsets_to_executed_code(self, mock_rs, mock_object_view):
        session = _mock_session()
        mock_rs.return_value = _mock_request_session(session)
        mock_object_view.return_value = {"oop": 310, "inspection": "an Object", "basetype": "object", "loaded": False}
        wrapper_source = "sigWorkspace123\n^ [\n1+1.\n1/0\n] value"

        def decode_smallint(raw):
            value = int(raw)
            return int(_smallint_to_python(value)) if _is_smallint(value) else value

        def perform(receiver, selector, *args):
            receiver = int(receiver)
            decoded_args = tuple(decode_smallint(arg) for arg in args)
            if receiver == 700 and selector == "suspendedContext":
                return OopRef(701, session)
            if receiver == 701 and selector == "sender":
                return OopRef(702, session)
            if receiver == 702 and selector == "sender":
                return None
            if receiver == 701 and selector == "receiver":
                return OopRef(310, session)
            if receiver == 702 and selector == "receiver":
                return OopRef(320, session)
            if receiver == 310 and selector == "class":
                return OopRef(311, session)
            if receiver == 320 and selector == "class":
                return OopRef(321, session)
            if receiver == 311 and selector == "name":
                return "SigWorkspaceEvaluator"
            if receiver == 321 and selector == "name":
                return "Behavior"
            if receiver == 701 and selector == "method":
                return OopRef(711, session)
            if receiver == 702 and selector == "method":
                return OopRef(721, session)
            if receiver == 711 and selector == "selector":
                return "sigWorkspace123"
            if receiver == 721 and selector == "selector":
                return "helper"
            if receiver == 700 and selector == "_gsiDebuggerDetailedReportAt:":
                return OopRef(801 if decoded_args[0] == 1 else 811, session)
            if receiver == 801 and selector == "at:":
                index = decoded_args[0]
                if index == 5:
                    return 1
                if index == 6:
                    return OopRef(802, session)
                if index == 9:
                    return wrapper_source
                return None
            if receiver == 802 and selector == "at:":
                return 1 if decoded_args[0] == 1 else None
            if receiver == 811 and selector == "at:":
                index = decoded_args[0]
                if index == 5:
                    return 2
                if index == 6:
                    return OopRef(812, session)
                if index == 9:
                    return "helper ^ #done"
                return None
            if receiver == 812 and selector == "at:":
                return 8 if decoded_args[0] == 2 else None
            if selector == "printString":
                return ""
            return None

        session.perform.side_effect = perform

        with patch.dict("gemstone_p.app._DEBUG_SOURCE_HINTS", {700: "1+1.\n1/0"}, clear=True):
            frame_response = self.client.get("/debug/frame/700?index=0")

        self.assertEqual(frame_response.status_code, 200)
        frame_data = json.loads(frame_response.data)
        self.assertTrue(frame_data["success"])
        self.assertEqual(frame_data["methodName"], "Executed code @1 line 1")
        self.assertEqual(frame_data["source"], "1+1.\n1/0")
        self.assertEqual(frame_data["sourceOffset"], 1)
        self.assertEqual(frame_data["stepPoint"], 1)
        self.assertEqual(frame_data["lineNumber"], 1)

    @patch("gemstone_p.app.object_view")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_frames_live_uses_executed_code_label_when_source_hint_is_available(self, mock_rs, mock_object_view):
        session = _mock_session()
        mock_rs.return_value = _mock_request_session(session)
        mock_object_view.return_value = {"oop": 310, "inspection": "an Object", "basetype": "object", "loaded": False}

        def decode_smallint(raw):
            value = int(raw)
            return int(_smallint_to_python(value)) if _is_smallint(value) else value

        def perform(receiver, selector, *args):
            receiver = int(receiver)
            decoded_args = tuple(decode_smallint(arg) for arg in args)
            if receiver == 700 and selector == "suspendedContext":
                return OopRef(701, session)
            if receiver == 701 and selector == "sender":
                return OopRef(702, session)
            if receiver == 702 and selector == "sender":
                return None
            if receiver == 701 and selector == "receiver":
                return OopRef(310, session)
            if receiver == 702 and selector == "receiver":
                return OopRef(320, session)
            if receiver == 310 and selector == "class":
                return OopRef(311, session)
            if receiver == 320 and selector == "class":
                return OopRef(321, session)
            if receiver == 311 and selector == "name":
                return "SigWorkspaceEvaluator"
            if receiver == 321 and selector == "name":
                return "Behavior"
            if receiver == 701 and selector == "method":
                return OopRef(711, session)
            if receiver == 702 and selector == "method":
                return OopRef(721, session)
            if receiver == 711 and selector == "selector":
                return "sigWorkspace123"
            if receiver == 721 and selector == "selector":
                return "helper"
            if receiver == 701 and selector == "printString":
                return "SigWorkspaceEvaluator>>sigWorkspace123"
            if receiver == 702 and selector == "printString":
                return "Behavior>>helper"
            if receiver == 700 and selector == "_gsiDebuggerDetailedReportAt:":
                return OopRef(801 if decoded_args[0] == 1 else 811, session)
            if receiver == 801 and selector == "at:":
                index = decoded_args[0]
                if index == 5:
                    return 1
                if index == 6:
                    return OopRef(802, session)
                if index == 9:
                    return ""
                return None
            if receiver == 802 and selector == "at:":
                return 1 if decoded_args[0] == 1 else None
            if selector == "printString":
                return ""
            return None

        session.perform.side_effect = perform

        with patch.dict("gemstone_p.app._DEBUG_SOURCE_HINTS", {700: "1+1.\n1/0"}, clear=True):
            frames_response = self.client.get("/debug/frames/700")

        self.assertEqual(frames_response.status_code, 200)
        frames_data = json.loads(frames_response.data)
        self.assertTrue(frames_data["success"])
        self.assertEqual(frames_data["frames"][0]["name"], "Executed code @1 line 1")
        self.assertEqual(frames_data["frames"][1]["name"], "Behavior>>helper")

    @patch("gemstone_p.app.object_view")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_frames_live_normalizes_workspace_wrapper_frames_beyond_top_frame(self, mock_rs, mock_object_view):
        session = _mock_session()
        mock_rs.return_value = _mock_request_session(session)
        mock_object_view.return_value = {"oop": 310, "inspection": "an Object", "basetype": "object", "loaded": False}
        wrapper_source = "sigWorkspaceTop\n^ [\n1+1.\n3*3.\n1/0\n] value"

        def decode_smallint(raw):
            value = int(raw)
            return int(_smallint_to_python(value)) if _is_smallint(value) else value

        def perform(receiver, selector, *args):
            receiver = int(receiver)
            decoded_args = tuple(decode_smallint(arg) for arg in args)
            if receiver == 700 and selector == "suspendedContext":
                return OopRef(701, session)
            if receiver == 701 and selector == "sender":
                return OopRef(702, session)
            if receiver == 702 and selector == "sender":
                return OopRef(703, session)
            if receiver == 703 and selector == "sender":
                return None
            if receiver in {701, 703} and selector == "receiver":
                return OopRef(900, session)
            if receiver == 702 and selector == "receiver":
                return OopRef(320, session)
            if receiver == 900 and selector == "class":
                return OopRef(901, session)
            if receiver == 320 and selector == "class":
                return OopRef(321, session)
            if receiver == 901 and selector == "name":
                return "SigWorkspaceEvaluator"
            if receiver == 321 and selector == "name":
                return "Behavior"
            if receiver == 701 and selector == "method":
                return OopRef(711, session)
            if receiver == 702 and selector == "method":
                return OopRef(721, session)
            if receiver == 703 and selector == "method":
                return OopRef(731, session)
            if receiver == 711 and selector == "selector":
                return "sigWorkspaceTop"
            if receiver == 721 and selector == "selector":
                return "helper"
            if receiver == 731 and selector == "selector":
                return "sigWorkspaceWrapper"
            if receiver == 701 and selector == "printString":
                return "SigWorkspaceEvaluator>>sigWorkspaceTop"
            if receiver == 702 and selector == "printString":
                return "Behavior>>helper"
            if receiver == 703 and selector == "printString":
                return "SigWorkspaceEvaluator>>sigWorkspaceWrapper"
            if receiver == 700 and selector == "_gsiDebuggerDetailedReportAt:":
                return OopRef({1: 801, 2: 811, 3: 821}.get(decoded_args[0], 801), session)
            if receiver == 801 and selector == "at:":
                index = decoded_args[0]
                if index == 5:
                    return 4
                if index == 6:
                    return OopRef(802, session)
                if index == 9:
                    return wrapper_source
                return None
            if receiver == 811 and selector == "at:":
                index = decoded_args[0]
                if index == 5:
                    return 2
                if index == 6:
                    return OopRef(812, session)
                if index == 9:
                    return "helper ^ #done"
                return None
            if receiver == 821 and selector == "at:":
                index = decoded_args[0]
                if index == 5:
                    return 4
                if index == 6:
                    return OopRef(822, session)
                if index == 9:
                    return wrapper_source
                return None
            if receiver in {802, 822} and selector == "at:":
                return 31 if decoded_args[0] == 4 else None
            if receiver == 812 and selector == "at:":
                return 10 if decoded_args[0] == 2 else None
            if selector == "printString":
                return ""
            return None

        session.perform.side_effect = perform

        with patch.dict("gemstone_p.app._DEBUG_SOURCE_HINTS", {700: "1+1.\n3*3.\n1/0"}, clear=True):
            frames_response = self.client.get("/debug/frames/700")

        self.assertEqual(frames_response.status_code, 200)
        frames_data = json.loads(frames_response.data)
        self.assertTrue(frames_data["success"])
        self.assertEqual(frames_data["frames"][0]["name"], "Executed code @4 line 3")
        self.assertEqual(frames_data["frames"][1]["name"], "Behavior>>helper")
        self.assertEqual(frames_data["frames"][2]["name"], "Executed code @4 line 3")

    @patch("gemstone_p.app.object_view")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_frame_live_normalizes_selected_workspace_wrapper_frame(self, mock_rs, mock_object_view):
        session = _mock_session()
        mock_rs.return_value = _mock_request_session(session)
        mock_object_view.return_value = {"oop": 310, "inspection": "an Object", "basetype": "object", "loaded": False}
        wrapper_source = "sigWorkspaceTop\n^ [\n1+1.\n3*3.\n1/0\n] value"

        def decode_smallint(raw):
            value = int(raw)
            return int(_smallint_to_python(value)) if _is_smallint(value) else value

        def perform(receiver, selector, *args):
            receiver = int(receiver)
            decoded_args = tuple(decode_smallint(arg) for arg in args)
            if receiver == 700 and selector == "suspendedContext":
                return OopRef(701, session)
            if receiver == 701 and selector == "sender":
                return OopRef(702, session)
            if receiver == 702 and selector == "sender":
                return OopRef(703, session)
            if receiver == 703 and selector == "sender":
                return None
            if receiver in {701, 703} and selector == "receiver":
                return OopRef(900, session)
            if receiver == 702 and selector == "receiver":
                return OopRef(320, session)
            if receiver == 900 and selector == "class":
                return OopRef(901, session)
            if receiver == 320 and selector == "class":
                return OopRef(321, session)
            if receiver == 901 and selector == "name":
                return "SigWorkspaceEvaluator"
            if receiver == 321 and selector == "name":
                return "Behavior"
            if receiver == 701 and selector == "method":
                return OopRef(711, session)
            if receiver == 702 and selector == "method":
                return OopRef(721, session)
            if receiver == 703 and selector == "method":
                return OopRef(731, session)
            if receiver == 711 and selector == "selector":
                return "sigWorkspaceTop"
            if receiver == 721 and selector == "selector":
                return "helper"
            if receiver == 731 and selector == "selector":
                return "sigWorkspaceWrapper"
            if receiver == 700 and selector == "_gsiDebuggerDetailedReportAt:":
                return OopRef({1: 801, 2: 811, 3: 821}.get(decoded_args[0], 801), session)
            if receiver == 801 and selector == "at:":
                index = decoded_args[0]
                if index == 5:
                    return 4
                if index == 6:
                    return OopRef(802, session)
                if index == 9:
                    return wrapper_source
                return None
            if receiver == 811 and selector == "at:":
                index = decoded_args[0]
                if index == 5:
                    return 2
                if index == 6:
                    return OopRef(812, session)
                if index == 9:
                    return "helper ^ #done"
                return None
            if receiver == 821 and selector == "at:":
                index = decoded_args[0]
                if index == 5:
                    return 4
                if index == 6:
                    return OopRef(822, session)
                if index == 9:
                    return wrapper_source
                return None
            if receiver in {802, 822} and selector == "at:":
                return 31 if decoded_args[0] == 4 else None
            if receiver == 812 and selector == "at:":
                return 10 if decoded_args[0] == 2 else None
            if selector == "printString":
                return ""
            return None

        session.perform.side_effect = perform

        with patch.dict("gemstone_p.app._DEBUG_SOURCE_HINTS", {700: "1+1.\n3*3.\n1/0"}, clear=True):
            frame_response = self.client.get("/debug/frame/700?index=2")

        self.assertEqual(frame_response.status_code, 200)
        frame_data = json.loads(frame_response.data)
        self.assertTrue(frame_data["success"])
        self.assertEqual(frame_data["methodName"], "Executed code @4 line 3")
        self.assertEqual(frame_data["source"], "1+1.\n3*3.\n1/0")
        self.assertEqual(frame_data["sourceOffset"], 11)
        self.assertEqual(frame_data["lineNumber"], 3)

    @patch("gemstone_p.app.object_view")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_frame_uses_detailed_report_offsets(self, mock_rs, mock_object_view):
        session = _mock_session()
        session.eval.return_value = "doIt|17|Behavior|310|1/0|4|1|"
        mock_rs.return_value = _mock_request_session(session)
        mock_object_view.return_value = {"oop": 310, "inspection": "Behavior", "basetype": "class", "loaded": False}

        self.client.get("/debug/frame/700?index=0")

        script = session.eval.call_args[0][0]
        self.assertIn("proc _gsiStackReportFromLevel: frameLevel toLevel: frameLevel", script)
        self.assertIn("offsets := [[detail at: 6]", script)
        self.assertIn("stepValue := [detail at: 5]", script)
        self.assertIn("rawOffset := [offsets at: stepInt ifAbsent: [nil]]", script)

    @patch("gemstone_p.app.object_view")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_frame_uses_reported_line_number_when_offset_is_missing(self, mock_rs, mock_object_view):
        session = _mock_session()
        session.eval.return_value = "ZeroDivide (AbstractException) >> _signalToDebugger @12 line 9|17|Behavior|310|line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9|0|12|"
        mock_rs.return_value = _mock_request_session(session)
        mock_object_view.return_value = {"oop": 310, "inspection": "Behavior", "basetype": "class", "loaded": False}

        r = self.client.get("/debug/frame/700?index=0")

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["lineNumber"], 9)
        self.assertTrue(data["canStep"])
        self.assertTrue(data["hasFrame"])

    @patch("gemstone_p.app.object_view")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_frame_disables_step_variants_when_selected_frame_cannot_step(self, mock_rs, mock_object_view):
        session = _mock_session()
        session.eval.return_value = "Behavior>>helper|17|Behavior|310|helper ^ #done|0|0|"
        mock_rs.return_value = _mock_request_session(session)
        mock_object_view.return_value = {"oop": 310, "inspection": "Behavior", "basetype": "class", "loaded": False}

        r = self.client.get("/debug/frame/700?index=1")

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertTrue(data["hasFrame"])
        self.assertEqual(data["status"], "suspended")
        self.assertTrue(data["isLiveSession"])
        self.assertFalse(data["canStep"])
        self.assertTrue(data["canProceed"])
        self.assertTrue(data["canRestart"])
        self.assertTrue(data["canTrim"])
        self.assertTrue(data["canTerminate"])
        self.assertFalse(data["canStepInto"])
        self.assertFalse(data["canStepOver"])
        self.assertFalse(data["canStepReturn"])

    @patch("gemstone_p.app.object_view")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_frame_marks_missing_frame_as_terminated(self, mock_rs, mock_object_view):
        session = _mock_session()
        session.eval.return_value = "(no frame)|0|||0|0|"
        mock_rs.return_value = _mock_request_session(session)
        mock_object_view.return_value = {"oop": None, "inspection": "", "basetype": "object", "loaded": False}

        r = self.client.get("/debug/frame/700?index=99")

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["status"], "terminated")
        self.assertFalse(data["isLiveSession"])
        self.assertFalse(data["hasFrame"])
        self.assertFalse(data["canProceed"])
        self.assertFalse(data["canRestart"])
        self.assertFalse(data["canTrim"])
        self.assertFalse(data["canTerminate"])

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_step_uses_process_step_selectors(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "anExecBlock"
        mock_rs.return_value = _mock_request_session(session)

        r = self.client.post("/debug/step/700", json={})

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        script = session.eval.call_args[0][0]
        self.assertIn("stepLevel := 1", script)
        self.assertIn("respondsTo: #step:", script)
        self.assertIn("perform: #step: with: stepLevel", script)
        self.assertIn("respondsTo: #stepIntoFromLevel:", script)
        self.assertIn("perform: #stepIntoFromLevel: with: stepLevel", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_step_unsupported_includes_diagnostics(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "false"
        mock_rs.return_value = _mock_request_session(session)

        r = self.client.post("/debug/step/700", json={"index": 2})

        self.assertEqual(r.status_code, 400)
        data = json.loads(r.data)
        self.assertFalse(data["success"])
        self.assertEqual(data["action"], "step")
        self.assertEqual(data["threadOop"], 700)
        self.assertEqual(data["frameIndex"], 2)
        self.assertEqual(data["status"], "terminated")
        self.assertFalse(data["liveProcess"])
        self.assertEqual(
            data["selectors"],
            ["step:", "stepIntoFromLevel:", "_stepIntoInFrame:", "gciStepIntoFromLevel:"],
        )

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_step_into_uses_process_step_into_selectors(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "anExecBlock"
        mock_rs.return_value = _mock_request_session(session)

        r = self.client.post("/debug/step-into/700", json={})

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertIn("status", data)
        script = session.eval.call_args[0][0]
        self.assertIn("stepLevel := 1", script)
        self.assertIn("respondsTo: #stepIntoFromLevel:", script)
        self.assertIn("perform: #stepIntoFromLevel: with: stepLevel", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_step_over_uses_selected_frame_level(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "anExecBlock"
        mock_rs.return_value = _mock_request_session(session)

        r = self.client.post("/debug/step-over/700", json={"index": 2})

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["status"], "terminated")
        script = session.eval.call_args[0][0]
        self.assertIn("stepLevel := 3", script)
        self.assertIn("respondsTo: #stepOverFromLevel:", script)
        self.assertIn("perform: #stepOverFromLevel: with: stepLevel", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_step_return_uses_selected_frame_level(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "anExecBlock"
        mock_rs.return_value = _mock_request_session(session)

        r = self.client.post("/debug/step-return/700", json={"index": 2})

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["frameIndex"], 1)
        self.assertEqual(data["status"], "terminated")
        script = session.eval.call_args[0][0]
        self.assertIn("stepLevel := 3", script)
        self.assertIn("respondsTo: #stepOverFromLevel:", script)
        self.assertIn("perform: #stepOverFromLevel: with: stepLevel", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_step_over_waits_for_live_process_to_suspend_before_returning(self, mock_rs):
        session = _mock_session()
        status_state = {"checks": 0}

        def perform(receiver, selector, *args):
            receiver = int(receiver)
            if receiver == 700 and selector == "stepOverFromLevel:":
                return True
            if receiver == 700 and selector == "printString":
                current = "running" if status_state["checks"] == 0 else "suspended"
                return f"GsProcess(oop=700, status={current}, priority=15)"
            if receiver == 700 and selector == "status":
                current = "running" if status_state["checks"] == 0 else "suspended"
                status_state["checks"] += 1
                return current
            if receiver == 700 and selector == "suspendedContext":
                return OopRef(701, session)
            return None

        session.perform.side_effect = perform
        mock_rs.return_value = _mock_request_session(session)

        r = self.client.post("/debug/step-over/700", json={"index": 2})

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["status"], "suspended")

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_step_over_maps_normalized_top_selection_to_executed_workspace_frame(self, mock_rs):
        session = _mock_session()
        step_levels = []
        step_fallback_levels = []
        step_state = {"point": 1}

        def perform(receiver, selector, *args):
            receiver = int(receiver)
            if receiver == 700 and selector == "stepOverFromLevel:":
                step_levels.append(int(args[0]))
                if int(args[0]) == 2:
                    step_state["point"] = 2
                    return True
                return False
            if receiver == 700 and selector == "step:":
                step_fallback_levels.append(int(args[0]))
                if int(args[0]) == 2:
                    step_state["point"] = 2
                    return True
                return False
            if receiver == 700 and selector == "printString":
                return "GsProcess(oop=700, status=suspended, priority=15)"
            if receiver == 700 and selector == "status":
                return "suspended"
            if receiver == 700 and selector == "suspendedContext":
                return OopRef(701, session)
            if receiver == 701 and selector == "sender":
                return OopRef(702, session)
            if receiver == 702 and selector == "sender":
                return None
            if receiver == 701 and selector == "receiver":
                return OopRef(710, session)
            if receiver == 702 and selector == "receiver":
                return OopRef(720, session)
            if receiver == 710 and selector == "class":
                return OopRef(711, session)
            if receiver == 720 and selector == "class":
                return OopRef(721, session)
            if receiver == 711 and selector == "name":
                return "SmallInteger"
            if receiver == 721 and selector == "name":
                return "SigWorkspaceEvaluator"
            if receiver == 701 and selector == "method":
                return OopRef(712, session)
            if receiver == 702 and selector == "method":
                return OopRef(722, session)
            if receiver == 712 and selector == "selector":
                return "/"
            if receiver == 722 and selector == "selector":
                return "sigWorkspaceDoIt"
            if receiver == 702 and selector in {"sourceString", "sourceCode"}:
                return "1+1.\n1/0"
            if receiver == 700 and selector == "_gsiDebuggerDetailedReportAt:":
                return OopRef(730 + int(args[0]), session)
            if receiver == 731 and selector == "at:":
                return step_state["point"] if int(args[0]) == 5 else None
            if receiver == 732 and selector == "at:":
                return step_state["point"] if int(args[0]) == 5 else None
            return None

        session.perform.side_effect = perform
        mock_rs.return_value = _mock_request_session(session)

        r = self.client.post("/debug/step-over/700", json={"index": 0})

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["frameIndex"], 0)
        self.assertEqual(step_levels, [2])
        self.assertTrue(all(level == 2 for level in step_fallback_levels))

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_step_over_falls_back_to_single_step_when_restarted_top_frame_does_not_advance(self, mock_rs):
        session = _mock_session()
        calls = []
        step_state = {"point": 0}

        def perform(receiver, selector, *args):
            receiver = int(receiver)
            if receiver == 700 and selector == "stepOverFromLevel:":
                calls.append(("stepOver", int(args[0])))
                return int(args[0]) == 2
            if receiver == 700 and selector == "step:":
                calls.append(("step", int(args[0])))
                if int(args[0]) == 2:
                    step_state["point"] = 2
                    return True
                return False
            if receiver == 700 and selector == "printString":
                return "GsProcess(oop=700, status=suspended, priority=15)"
            if receiver == 700 and selector == "status":
                return "suspended"
            if receiver == 700 and selector == "suspendedContext":
                return OopRef(701, session)
            if receiver == 701 and selector == "sender":
                return OopRef(702, session)
            if receiver == 702 and selector == "sender":
                return None
            if receiver == 701 and selector == "receiver":
                return OopRef(710, session)
            if receiver == 702 and selector == "receiver":
                return OopRef(720, session)
            if receiver == 710 and selector == "class":
                return OopRef(711, session)
            if receiver == 720 and selector == "class":
                return OopRef(721, session)
            if receiver == 711 and selector == "name":
                return "SmallInteger"
            if receiver == 721 and selector == "name":
                return "SigWorkspaceEvaluator"
            if receiver == 701 and selector == "method":
                return OopRef(712, session)
            if receiver == 702 and selector == "method":
                return OopRef(722, session)
            if receiver == 712 and selector == "selector":
                return "/"
            if receiver == 722 and selector == "selector":
                return "sigWorkspaceDoIt"
            if receiver == 702 and selector in {"sourceString", "sourceCode"}:
                return "1+1.\n1/0"
            if receiver == 700 and selector == "_gsiDebuggerDetailedReportAt:":
                return OopRef(730 + int(args[0]), session)
            if receiver == 731 and selector == "at:":
                return step_state["point"] if int(args[0]) == 5 else None
            if receiver == 732 and selector == "at:":
                return step_state["point"] if int(args[0]) == 5 else None
            return None

        session.perform.side_effect = perform
        mock_rs.return_value = _mock_request_session(session)

        r = self.client.post("/debug/step-over/700", json={"index": 0})

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["frameIndex"], 0)
        self.assertEqual(calls, [("stepOver", 2), ("step", 2)])

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_step_return_waits_for_live_process_and_selects_caller_frame(self, mock_rs):
        session = _mock_session()
        status_state = {"checks": 0}

        def perform(receiver, selector, *args):
            receiver = int(receiver)
            if receiver == 700 and selector == "stepOverFromLevel:":
                return True
            if receiver == 700 and selector == "printString":
                current = "running" if status_state["checks"] == 0 else "suspended"
                return f"GsProcess(oop=700, status={current}, priority=15)"
            if receiver == 700 and selector == "status":
                current = "running" if status_state["checks"] == 0 else "suspended"
                status_state["checks"] += 1
                return current
            if receiver == 700 and selector == "suspendedContext":
                return OopRef(701, session)
            return None

        session.perform.side_effect = perform
        mock_rs.return_value = _mock_request_session(session)

        r = self.client.post("/debug/step-return/700", json={"index": 2})

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["frameIndex"], 1)
        self.assertEqual(data["status"], "suspended")

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_restart_trims_selected_context_then_restarts(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "true"
        mock_rs.return_value = _mock_request_session(session)

        r = self.client.post("/debug/restart/700", json={"index": 2})

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        script = session.eval.call_args[0][0]
        self.assertIn("ctx := [proc suspendedContext]", script)
        self.assertIn("respondsTo: #trimTo:", script)
        self.assertIn("result := [proc trimTo: ctx]", script)
        self.assertIn("respondsTo: #_trimStackToLevel:", script)
        self.assertIn("_trimStackToLevel: restartLevel", script)
        self.assertIn("restartLevel := 3", script)
        self.assertIn("restarted := [proc restart]", script)

    @patch("gemstone_p.routes_debugger.eval_in_context")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_restart_replays_stored_source_and_returns_new_thread_oop_when_live_step_stays_past_one(
        self,
        mock_rs,
        mock_eval_in_context,
    ):
        session = _mock_session()
        terminated = []
        source = "1+1.\n1/0"
        app_module._remember_debug_source_hint(700, source)
        app_module._remember_debug_replay_receiver(700, 900)
        self.addCleanup(app_module._forget_debug_source_hint, 700)
        self.addCleanup(app_module._forget_debug_source_hint, 990)
        self.addCleanup(app_module._forget_debug_replay_receiver, 700)
        self.addCleanup(app_module._forget_debug_replay_receiver, 990)

        def perform(receiver, selector, *args):
            receiver = int(receiver)
            if receiver == 700 and selector == "suspendedContext":
                return OopRef(701, session)
            if receiver == 701 and selector == "sender":
                return None
            if receiver == 701 and selector == "printString":
                return "Object>>haltedMethod"
            if receiver == 701 and selector == "receiver":
                return None
            if receiver == 700 and selector == "trimTo:":
                return True
            if receiver == 700 and selector == "_gsiDebuggerDetailedReportAt:":
                return OopRef(801, session)
            if receiver == 801 and selector == "at:":
                return 4 if int(args[0]) in {5, 42} else None
            if receiver == 700 and selector in {"_gsiStepAtLevel:step:", "jumpToStepPoint:", "runToStepPoint:", "jumpTo:"}:
                return True
            if receiver == 700 and selector in {"terminate", "terminateProcess"}:
                terminated.append((selector, args))
                return True
            if receiver == 990 and selector == "suspendedContext":
                return OopRef(991, session)
            if receiver == 991 and selector == "sender":
                return None
            if receiver == 991 and selector == "printString":
                return "Object>>haltedMethod"
            if receiver == 991 and selector == "receiver":
                return OopRef(900, session)
            if receiver == 990 and selector == "_gsiDebuggerDetailedReportAt:":
                return OopRef(981, session)
            if receiver == 981 and selector == "at:":
                return 1 if int(args[0]) in {5, 42} else None
            if receiver == 990 and selector in {"_gsiStepAtLevel:step:", "jumpToStepPoint:", "runToStepPoint:", "jumpTo:"}:
                return True
            if selector == "printString":
                return ""
            return None

        session.perform.side_effect = perform
        mock_eval_in_context.return_value = {
            "isException": True,
            "resultOop": 123,
            "errorText": "ZeroDivide",
            "debugThreadOop": 990,
            "exceptionOop": 456,
        }
        mock_rs.return_value = _mock_request_session(session)

        r = self.client.post("/debug/restart/700", json={"index": 0})

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["threadOop"], 990)
        self.assertEqual(mock_eval_in_context.call_args[0], (session, 900, source, "smalltalk"))
        self.assertTrue(terminated)
        self.assertEqual(app_module._debug_source_hint(990), source)
        self.assertEqual(app_module._debug_source_hint(700), "")
        self.assertEqual(app_module._debug_replay_receiver(990), 900)
        self.assertIsNone(app_module._debug_replay_receiver(700))

    @patch("gemstone_p.routes_debugger.eval_in_context")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_restart_replay_decision_uses_server_level_one_step_point(self, mock_rs, mock_eval_in_context):
        session = _mock_session()
        source = "1+1.\n1/0"
        app_module._remember_debug_source_hint(700, source)
        app_module._remember_debug_replay_receiver(700, 900)
        self.addCleanup(app_module._forget_debug_source_hint, 700)
        self.addCleanup(app_module._forget_debug_source_hint, 990)
        self.addCleanup(app_module._forget_debug_replay_receiver, 700)
        self.addCleanup(app_module._forget_debug_replay_receiver, 990)

        def decode_smallint(raw):
            value = int(raw)
            return int(_smallint_to_python(value)) if _is_smallint(value) else value

        def perform(receiver, selector, *args):
            receiver = int(receiver)
            if receiver == 700 and selector == "suspendedContext":
                return OopRef(701, session)
            if receiver == 701 and selector == "sender":
                return OopRef(702, session)
            if receiver == 702 and selector == "sender":
                return None
            if receiver in {701, 702} and selector == "printString":
                return "Object>>haltedMethod"
            if receiver == 700 and selector == "trimTo:":
                return True
            if receiver == 700 and selector == "_gsiDebuggerDetailedReportAt:":
                level = decode_smallint(args[0])
                return OopRef(800 + level, session)
            if 801 <= receiver <= 810 and selector == "at:":
                index = decode_smallint(args[0])
                detail_level = receiver - 800
                if index in {5, 42}:
                    return 4 if detail_level == 1 else 1
                return None
            if receiver == 700 and selector in {"_gsiStepAtLevel:step:", "jumpToStepPoint:", "runToStepPoint:", "jumpTo:"}:
                return True
            if receiver == 700 and selector in {"terminate", "terminateProcess"}:
                return True
            if receiver == 990 and selector == "suspendedContext":
                return OopRef(991, session)
            if receiver == 991 and selector == "sender":
                return None
            if receiver == 991 and selector == "receiver":
                return OopRef(900, session)
            if receiver == 991 and selector == "printString":
                return "Object>>haltedMethod"
            if receiver == 990 and selector == "_gsiDebuggerDetailedReportAt:":
                return OopRef(981, session)
            if receiver == 981 and selector == "at:":
                return 1 if decode_smallint(args[0]) in {5, 42} else None
            if selector == "printString":
                return ""
            return None

        session.perform.side_effect = perform
        mock_eval_in_context.return_value = {
            "isException": True,
            "resultOop": 123,
            "errorText": "ZeroDivide",
            "debugThreadOop": 990,
            "exceptionOop": 456,
        }
        mock_rs.return_value = _mock_request_session(session)

        r = self.client.post("/debug/restart/700", json={"index": 0})

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["threadOop"], 990)
        self.assertEqual(mock_eval_in_context.call_args[0], (session, 900, source, "smalltalk"))

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_restart_returns_same_thread_when_live_step_is_already_one(self, mock_rs):
        session = _mock_session()

        def perform(receiver, selector, *args):
            receiver = int(receiver)
            if receiver == 700 and selector == "suspendedContext":
                return OopRef(701, session)
            if receiver == 701 and selector == "sender":
                return None
            if receiver == 701 and selector == "printString":
                return "Object>>haltedMethod"
            if receiver == 700 and selector == "trimTo:":
                return True
            if receiver == 700 and selector == "_gsiDebuggerDetailedReportAt:":
                return OopRef(801, session)
            if receiver == 801 and selector == "at:":
                return 1 if int(args[0]) in {5, 42} else None
            if receiver == 700 and selector in {"_gsiStepAtLevel:step:", "jumpToStepPoint:", "runToStepPoint:", "jumpTo:"}:
                return True
            if selector == "printString":
                return ""
            return None

        session.perform.side_effect = perform
        mock_rs.return_value = _mock_request_session(session)

        r = self.client.post("/debug/restart/700", json={"index": 0})

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["threadOop"], 700)

    @patch("gemstone_p.routes_debugger.eval_in_context")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_restart_allows_top_frame_rewind_when_trim_is_already_exhausted(self, mock_rs, mock_eval_in_context):
        session = _mock_session()
        source = "1+1.\n1/0"
        app_module._remember_debug_source_hint(700, source)
        app_module._remember_debug_replay_receiver(700, 900)
        self.addCleanup(app_module._forget_debug_source_hint, 700)
        self.addCleanup(app_module._forget_debug_source_hint, 990)
        self.addCleanup(app_module._forget_debug_replay_receiver, 700)
        self.addCleanup(app_module._forget_debug_replay_receiver, 990)

        def decode_smallint(raw):
            value = int(raw)
            return int(_smallint_to_python(value)) if _is_smallint(value) else value

        def perform(receiver, selector, *args):
            receiver = int(receiver)
            if receiver == 700 and selector == "suspendedContext":
                return OopRef(701, session)
            if receiver == 701 and selector == "sender":
                return None
            if receiver == 701 and selector == "printString":
                return "Object>>haltedMethod"
            if receiver == 701 and selector == "receiver":
                return OopRef(900, session)
            if receiver == 700 and selector in {"trimTo:", "trimStackToLevel:", "_trimStackToLevel:"}:
                return False
            if receiver == 700 and selector == "_gsiDebuggerDetailedReportAt:":
                return OopRef(800 + decode_smallint(args[0]), session)
            if 801 <= receiver <= 810 and selector == "at:":
                return 4 if decode_smallint(args[0]) in {5, 42} else None
            if receiver == 700 and selector in {"_gsiStepAtLevel:step:", "jumpToStepPoint:", "runToStepPoint:", "jumpTo:", "terminate"}:
                return True
            if receiver == 990 and selector == "suspendedContext":
                return OopRef(991, session)
            if receiver == 991 and selector == "sender":
                return None
            if receiver == 991 and selector == "receiver":
                return OopRef(900, session)
            if receiver == 991 and selector == "printString":
                return "Object>>haltedMethod"
            if receiver == 990 and selector == "_gsiDebuggerDetailedReportAt:":
                return OopRef(981, session)
            if receiver == 981 and selector == "at:":
                return 1 if decode_smallint(args[0]) in {5, 42} else None
            if selector == "printString":
                return ""
            return None

        session.perform.side_effect = perform
        mock_eval_in_context.return_value = {
            "isException": True,
            "resultOop": 123,
            "errorText": "ZeroDivide",
            "debugThreadOop": 990,
            "exceptionOop": 456,
        }
        mock_rs.return_value = _mock_request_session(session)

        r = self.client.post("/debug/restart/700", json={"index": 0})

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["threadOop"], 990)
        self.assertEqual(mock_eval_in_context.call_args[0], (session, 900, source, "smalltalk"))

    @patch("gemstone_p.routes_debugger.eval_in_context")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_restart_uses_deepest_workspace_frame_for_restart_trim(self, mock_rs, mock_eval_in_context):
        session = _mock_session()
        trim_targets = []
        source = "1+1.\n3*3.\n1/0"
        app_module._remember_debug_source_hint(700, source)
        self.addCleanup(app_module._forget_debug_source_hint, 700)

        def decode_smallint(raw):
            value = int(raw)
            return int(_smallint_to_python(value)) if _is_smallint(value) else value

        def perform(receiver, selector, *args):
            receiver = int(receiver)
            decoded_args = tuple(decode_smallint(arg) for arg in args)
            if receiver == 700 and selector == "suspendedContext":
                return OopRef(701, session)
            if receiver == 701 and selector == "sender":
                return OopRef(702, session)
            if receiver == 702 and selector == "sender":
                return OopRef(703, session)
            if receiver == 703 and selector == "sender":
                return None
            if receiver in {701, 702, 703} and selector == "receiver":
                return OopRef(900, session)
            if receiver == 900 and selector == "class":
                return OopRef(901, session)
            if receiver == 901 and selector == "name":
                return "SigWorkspaceEvaluator"
            if receiver == 701 and selector == "method":
                return OopRef(711, session)
            if receiver == 702 and selector == "method":
                return OopRef(721, session)
            if receiver == 703 and selector == "method":
                return OopRef(731, session)
            if receiver == 711 and selector == "selector":
                return "sigWorkspaceTop"
            if receiver == 721 and selector == "selector":
                return "helper"
            if receiver == 731 and selector == "selector":
                return "sigWorkspaceWrapper"
            if receiver == 700 and selector == "_gsiDebuggerDetailedReportAt:":
                level = decoded_args[0]
                return OopRef({1: 801, 2: 811, 3: 821}.get(level, 801), session)
            if receiver == 801 and selector == "at:":
                index = decoded_args[0]
                if index == 5:
                    return 4
                if index == 6:
                    return OopRef(802, session)
                if index == 9:
                    return source
                return None
            if receiver == 811 and selector == "at:":
                index = decoded_args[0]
                if index == 5:
                    return 2
                if index == 6:
                    return OopRef(812, session)
                if index == 9:
                    return "helper ^ #done"
                return None
            if receiver == 821 and selector == "at:":
                index = decoded_args[0]
                if index == 5:
                    return 4
                if index == 6:
                    return OopRef(822, session)
                if index == 9:
                    return source
                return None
            if receiver in {802, 812, 822} and selector == "at:":
                return 1 if decoded_args[0] == 1 else None
            if receiver == 700 and selector == "trimTo:":
                trim_targets.append(decoded_args[0])
                return True
            if receiver == 700 and selector in {"_gsiStepAtLevel:step:", "jumpToStepPoint:", "runToStepPoint:", "jumpTo:", "terminate"}:
                return True
            if selector == "printString":
                return ""
            return None

        session.perform.side_effect = perform
        mock_eval_in_context.return_value = {
            "isException": False,
            "resultOop": 9,
            "errorText": "",
            "debugThreadOop": None,
            "exceptionOop": None,
        }
        mock_rs.return_value = _mock_request_session(session)

        r = self.client.post("/debug/restart/700", json={"index": 0})

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertTrue(data["completed"])
        self.assertEqual(trim_targets, [703])
        self.assertEqual(mock_eval_in_context.call_args[0], (session, 900, source, "smalltalk"))

    @patch("gemstone_p.routes_debugger.eval_in_context")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_restart_uses_workspace_selector_when_wrapper_source_is_unavailable(self, mock_rs, mock_eval_in_context):
        session = _mock_session()
        trim_targets = []
        source = "1+1.\n3*3.\n1/0"
        app_module._remember_debug_source_hint(700, source)
        self.addCleanup(app_module._forget_debug_source_hint, 700)

        def decode_smallint(raw):
            value = int(raw)
            return int(_smallint_to_python(value)) if _is_smallint(value) else value

        def perform(receiver, selector, *args):
            receiver = int(receiver)
            decoded_args = tuple(decode_smallint(arg) for arg in args)
            if receiver == 700 and selector == "suspendedContext":
                return OopRef(701, session)
            if receiver == 701 and selector == "sender":
                return OopRef(702, session)
            if receiver == 702 and selector == "sender":
                return OopRef(703, session)
            if receiver == 703 and selector == "sender":
                return None
            if receiver in {701, 702, 703} and selector == "receiver":
                return OopRef(900, session)
            if receiver == 900 and selector == "class":
                return OopRef(901, session)
            if receiver == 901 and selector == "name":
                return "SigWorkspaceEvaluator"
            if receiver == 701 and selector == "method":
                return OopRef(711, session)
            if receiver == 702 and selector == "method":
                return OopRef(721, session)
            if receiver == 703 and selector == "method":
                return OopRef(731, session)
            if receiver == 711 and selector == "selector":
                return "sigWorkspaceTop"
            if receiver == 721 and selector == "selector":
                return "helper"
            if receiver == 731 and selector == "selector":
                return "sigWorkspaceTop"
            if receiver == 700 and selector == "_gsiDebuggerDetailedReportAt:":
                level = decoded_args[0]
                return OopRef({1: 801, 2: 811, 3: 821}.get(level, 801), session)
            if receiver == 801 and selector == "at:":
                index = decoded_args[0]
                if index == 5:
                    return 4
                if index == 6:
                    return OopRef(802, session)
                if index == 9:
                    return ""
                return None
            if receiver == 811 and selector == "at:":
                index = decoded_args[0]
                if index == 5:
                    return 2
                if index == 6:
                    return OopRef(812, session)
                if index == 9:
                    return "helper ^ #done"
                return None
            if receiver == 821 and selector == "at:":
                index = decoded_args[0]
                if index == 5:
                    return 4
                if index == 6:
                    return OopRef(822, session)
                if index == 9:
                    return ""
                return None
            if receiver in {802, 812, 822} and selector == "at:":
                return 1 if decoded_args[0] == 1 else None
            if receiver == 700 and selector == "trimTo:":
                trim_targets.append(decoded_args[0])
                return True
            if receiver == 700 and selector in {"_gsiStepAtLevel:step:", "jumpToStepPoint:", "runToStepPoint:", "jumpTo:", "terminate"}:
                return True
            if selector == "printString":
                return ""
            return None

        session.perform.side_effect = perform
        mock_eval_in_context.return_value = {
            "isException": False,
            "resultOop": 9,
            "errorText": "",
            "debugThreadOop": None,
            "exceptionOop": None,
        }
        mock_rs.return_value = _mock_request_session(session)

        r = self.client.post("/debug/restart/700", json={"index": 0})

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertTrue(data["completed"])
        self.assertEqual(trim_targets, [703])
        self.assertEqual(mock_eval_in_context.call_args[0], (session, 900, source, "smalltalk"))

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_terminate_uses_process_terminate_selectors_and_clears_hint(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "true"
        mock_rs.return_value = _mock_request_session(session)

        with patch.dict("gemstone_p.app._DEBUG_SOURCE_HINTS", {700: "1/0"}, clear=True), patch.dict("gemstone_p.app._DEBUG_REPLAY_RECEIVERS", {700: 900}, clear=True):
            r = self.client.post("/debug/terminate/700", json={})
            self.assertEqual(r.status_code, 200)
            data = json.loads(r.data)
            self.assertTrue(data["success"])
            self.assertEqual(data["action"], "terminate")
            self.assertEqual(data["status"], "terminated")
            self.assertEqual(app_module._debug_source_hint(700), "")
            self.assertIsNone(app_module._debug_replay_receiver(700))

        script = session.eval.call_args[0][0]
        self.assertIn("respondsTo: #terminate", script)
        self.assertIn("respondsTo: #terminateProcess", script)
        self.assertIn("ctx := [proc suspendedContext]", script)
        self.assertIn("ctx respondsTo: #terminateProcess", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_terminate_falls_back_to_script_when_direct_terminate_returns_false(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "true"

        def perform(receiver, selector, *args):
            receiver = int(receiver)
            if receiver == 700 and selector in {"terminate", "terminateProcess"}:
                return False
            return None

        session.perform.side_effect = perform
        mock_rs.return_value = _mock_request_session(session)

        r = self.client.post("/debug/terminate/700", json={})

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["action"], "terminate")
        script = session.eval.call_args[0][0]
        self.assertIn("respondsTo: #terminate", script)
        self.assertIn("respondsTo: #terminateProcess", script)
        self.assertIn("ctx := [proc suspendedContext]", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_terminate_treats_termination_started_process_as_terminated(self, mock_rs):
        session = _mock_session()
        state = {"terminating": False}

        def perform(receiver, selector, *args):
            receiver = int(receiver)
            if receiver == 700 and selector == "printString":
                status = "terminationStarted" if state["terminating"] else "suspended"
                return f"GsProcess(oop=700, status={status}, priority=15)"
            if receiver == 700 and selector == "suspendedContext":
                return OopRef(701, session)
            if receiver == 700 and selector == "terminate":
                state["terminating"] = True
                return True
            return None

        session.perform.side_effect = perform
        mock_rs.return_value = _mock_request_session(session)

        r = self.client.post("/debug/terminate/700", json={})

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["action"], "terminate")
        self.assertEqual(data["status"], "terminated")

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_trim_uses_selected_context_and_checks_result(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "true"
        mock_rs.return_value = _mock_request_session(session)

        r = self.client.post("/debug/trim/700", json={"index": 2})

        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        script = session.eval.call_args[0][0]
        self.assertIn("ctx := proc suspendedContext", script)
        self.assertIn("ctx := ctx sender. idx := idx + 1", script)
        self.assertIn("[proc trimTo: ctx] on: Error do: [:e | false]", script)

    @patch("gemstone_p.app.object_view")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_thread_local_returns_object_refs(self, mock_rs, mock_object_view):
        session = _mock_session()
        session.eval.return_value = "#session\t40\t'debug-session'\t41"
        mock_rs.return_value = _mock_request_session(session)
        mock_object_view.side_effect = [
            {"oop": 40, "inspection": "#session", "basetype": "symbol", "loaded": False},
            {"oop": 41, "inspection": "'debug-session'", "basetype": "string", "loaded": False},
        ]

        r = self.client.get("/debug/thread-local/700")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["entries"][0]["key"], "#session")
        self.assertEqual(data["entries"][0]["value"], "'debug-session'")
        self.assertEqual(data["entries"][0]["keyObject"]["inspection"], "#session")
        self.assertEqual(data["entries"][0]["valueObject"]["inspection"], "'debug-session'")
        script = session.eval.call_args[0][0]
        self.assertIn("proc threadStorage do:", script)
        self.assertIn("value asOop printString", script)
        mock_object_view.assert_any_call(session, 40, depth=0)
        mock_object_view.assert_any_call(session, 41, depth=0)

    def test_all_users_lookup_prefers_current_profile_symbol_list(self):
        from gemstone_p.app import _ALL_USERS_EXPR

        profile_idx = _ALL_USERS_EXPR.find("System myUserProfile symbolList objectNamed: #AllUsers")
        globals_idx = _ALL_USERS_EXPR.find("Globals at: #AllUsers ifAbsent: [nil]")
        user_globals_idx = _ALL_USERS_EXPR.find("UserGlobals at: #AllUsers ifAbsent: [nil]")

        self.assertGreaterEqual(profile_idx, 0)
        self.assertGreaterEqual(globals_idx, 0)
        self.assertGreaterEqual(user_globals_idx, 0)
        self.assertLess(profile_idx, globals_idx)
        self.assertLess(globals_idx, user_globals_idx)
        self.assertIn("allUsers := [System myUserProfile] on: Error do: [:e | nil].", _ALL_USERS_EXPR)


if __name__ == "__main__":
    unittest.main()

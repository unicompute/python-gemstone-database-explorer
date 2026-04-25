"""Basic smoke tests for gemstone-p routes (no live GemStone required)."""

import json
import unittest
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

from gemstone_p import __version__
import gemstone_p.session  # Ensure patch("gemstone_p.session...") resolves normally.


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
        session.eval.return_value = "true"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/transaction/persistent-mode")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertTrue(data["persistent"])
        script = session.eval.call_args[0][0]
        self.assertIn("GemStone session autoBeginTransaction printString", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_transaction_set_persistent_mode_returns_result_and_state(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "true"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post("/transaction/persistent-mode", json={"enable": True})
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertTrue(data["persistent"])
        self.assertEqual(data["result"], "Persistent mode enabled")
        script = session.eval.call_args[0][0]
        self.assertIn("autoBeginTransaction: true", script)

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
        self.assertIn("ctx receiver", script)
        self.assertIn("ctx tempNames do:", script)
        self.assertIn("ctx respondsTo: #quickStepPoint", script)
        self.assertIn("ctx respondsTo: #sourceOffsets", script)
        mock_object_view.assert_any_call(session, 310, depth=0)
        mock_object_view.assert_any_call(session, 77, depth=0)

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
        self.assertEqual(data["source"], "1/0")
        self.assertEqual(data["selfObject"]["inspection"], "Behavior")
        self.assertEqual(data["lineNumber"], 1)

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

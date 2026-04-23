"""Basic smoke tests for gemstone-p routes (no live GemStone required)."""

import json
import unittest
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

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
    def test_object_index(self, mock_rs):
        mock_rs.return_value = _mock_request_session(_mock_session())
        r = self.client.get("/object/index/12345")
        self.assertEqual(r.status_code, 200)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_transaction_commit(self, mock_rs):
        mock_rs.return_value = _mock_request_session(_mock_session())
        r = self.client.get("/transaction/commit")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])

    @patch("gemstone_p.app.gs_session.request_session")
    def test_transaction_abort(self, mock_rs):
        mock_rs.return_value = _mock_request_session(_mock_session())
        r = self.client.get("/transaction/abort")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])

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

    @patch("gemstone_p.app.gs_session.request_session")
    def test_constants_use_behavior_class_pool(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "Foo|123\n"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/object/constants/12345")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["constants"], [{"key": "Foo", "value": "123"}])
        script = session.eval.call_args[0][0]
        self.assertIn("obj isBehavior", script)
        self.assertIn("behavior classPool keysAndValuesDo:", script)

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
        r = self.client.get("/class-browser/categories?class=Object&meta=1")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["categories"], ["-- all --", "accessing", "initialization"])
        script = session.eval.call_args[0][0]
        self.assertIn("objectNamed: 'Object' asSymbol) class", script)
        self.assertIn("cls categoryNames", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_source_for_method(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "printString ^ 'ok'"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/class-browser/source?class=Object&selector=printString")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["source"], "printString ^ 'ok'")
        script = session.eval.call_args[0][0]
        self.assertIn("compiledMethodAt: 'printString' asSymbol", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_query_implementors(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "Object>>printString\nBehavior>>printString\n"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.get("/class-browser/query?selector=printString&mode=implementors&rootClassName=Object&hierarchyScope=sub")
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["results"], ["Behavior>>printString", "Object>>printString"])
        script = session.eval.call_args[0][0]
        self.assertIn("candidate asString = token", script)
        self.assertIn("scope := 'sub'", script)
        self.assertIn("rootClass := (System myUserProfile symbolList objectNamed: 'Object' asSymbol)", script)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_compile_uses_mutating_session(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "Success"
        mock_rs.return_value = _mock_request_session(session)
        r = self.client.post(
            "/class-browser/compile",
            json={"className": "Object", "category": "testing", "source": "foo ^ 1", "meta": True},
        )
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["result"], "Success")
        script = session.eval.call_args[0][0]
        self.assertIn("objectNamed: 'Object' asSymbol) class", script)
        self.assertIn("compileMethod: source category: 'testing' asSymbol", script)
        self.assertEqual(mock_rs.call_args.kwargs, {"read_only": False})

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

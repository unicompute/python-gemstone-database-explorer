"""Focused API-shape contract tests for frontend-facing JSON payloads."""

import json
import unittest
from contextlib import contextmanager
from unittest.mock import MagicMock, patch


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


class TestApiContracts(unittest.TestCase):
    def setUp(self):
        patcher = patch("gemstone_p.session.GemStoneConfig")
        mock_config_cls = patcher.start()
        mock_config_cls.from_env.return_value = MagicMock()
        self.addCleanup(patcher.stop)

        from gemstone_p.app import create_app

        self.app = create_app()
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_classes_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "Object\nBehavior\n"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.get("/class-browser/classes?dictionary=UserGlobals")
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "classes"})
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["classes"], list)
        self.assertEqual(data["classes"], ["Object", "Behavior"])
        self.assertTrue(all(isinstance(item, str) for item in data["classes"]))

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_class_location_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "Globals\nUserGlobals\n"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.get("/class-browser/class-location?class=Object")
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "dictionary", "matches"})
        self.assertIs(data["success"], True)
        self.assertEqual(data["dictionary"], "")
        self.assertIsInstance(data["matches"], list)
        self.assertEqual(len(data["matches"]), 2)
        self.assertEqual(
            data["matches"][0],
            {"className": "Object", "dictionary": "Globals"},
        )
        self.assertEqual(set(data["matches"][0].keys()), {"className", "dictionary"})

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_versions_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "version 1|printString ^ 'old'|940\nversion 2|printString ^ 'new'|\n"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.get("/class-browser/versions?class=Object&dictionary=Globals&selector=printString")
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "versions"})
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["versions"], list)
        self.assertEqual(len(data["versions"]), 2)
        first = data["versions"][0]
        second = data["versions"][1]
        self.assertEqual(set(first.keys()), {"label", "source", "methodOop"})
        self.assertIsInstance(first["label"], str)
        self.assertIsInstance(first["source"], str)
        self.assertIsInstance(first["methodOop"], int)
        self.assertIsNone(second["methodOop"])

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_query_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "Globals|Object|0|printString\nGlobals|Object|1|new\n"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.get("/class-browser/query?selector=printString&mode=implementors")
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "results"})
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["results"], list)
        self.assertEqual(len(data["results"]), 2)
        for item in data["results"]:
            self.assertEqual(
                set(item.keys()),
                {"label", "className", "selector", "meta", "dictionary"},
            )
            self.assertIsInstance(item["label"], str)
            self.assertIsInstance(item["className"], str)
            self.assertIsInstance(item["selector"], str)
            self.assertIsInstance(item["meta"], bool)
            self.assertIsInstance(item["dictionary"], str)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_compile_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|displayString|testing|printString|Success"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.post(
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
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(
            set(data.keys()),
            {"success", "result", "selector", "category", "previousSelector"},
        )
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["result"], str)
        self.assertTrue(data["selector"] is None or isinstance(data["selector"], str))
        self.assertIsInstance(data["category"], str)
        self.assertTrue(
            data["previousSelector"] is None or isinstance(data["previousSelector"], str)
        )

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_add_dictionary_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|TmpUI"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.post("/class-browser/add-dictionary", json={"name": "TmpUI"})
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "result", "dictionary"})
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["result"], str)
        self.assertIsInstance(data["dictionary"], str)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_rename_class_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|RenamedObject|Globals"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.post(
            "/class-browser/rename-class",
            json={
                "className": "Object",
                "dictionary": "Globals",
                "targetClassName": "RenamedObject",
            },
        )
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "result", "className", "dictionary"})
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["result"], str)
        self.assertIsInstance(data["className"], str)
        self.assertIsInstance(data["dictionary"], str)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_move_class_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|Object|UserGlobals"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.post(
            "/class-browser/move-class",
            json={
                "className": "Object",
                "dictionary": "Globals",
                "targetDictionary": "UserGlobals",
            },
        )
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "result", "className", "dictionary"})
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["result"], str)
        self.assertIsInstance(data["className"], str)
        self.assertIsInstance(data["dictionary"], str)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_add_category_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|testing"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.post(
            "/class-browser/add-category",
            json={
                "className": "Object",
                "dictionary": "Globals",
                "category": "testing",
                "meta": False,
            },
        )
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "result", "category"})
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["result"], str)
        self.assertIsInstance(data["category"], str)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_add_instance_variable_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|name"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.post(
            "/class-browser/add-instance-variable",
            json={
                "className": "Object",
                "dictionary": "Globals",
                "variableName": "name",
            },
        )
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "result", "variableName"})
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["result"], str)
        self.assertIsInstance(data["variableName"], str)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_add_class_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|TmpUiClass|UserGlobals|Object"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.post(
            "/class-browser/add-class",
            json={
                "className": "TmpUiClass",
                "dictionary": "UserGlobals",
                "superclassName": "Object",
                "superclassDictionary": "Globals",
            },
        )
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(
            set(data.keys()),
            {"success", "result", "className", "dictionary", "superclassName"},
        )
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["result"], str)
        self.assertIsInstance(data["className"], str)
        self.assertIsInstance(data["dictionary"], str)
        self.assertIsInstance(data["superclassName"], str)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_remove_category_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|3|as yet unclassified"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.post(
            "/class-browser/remove-category",
            json={
                "className": "Object",
                "dictionary": "Globals",
                "category": "testing",
                "meta": False,
            },
        )
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "result", "category", "movedCount"})
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["result"], str)
        self.assertIsInstance(data["category"], str)
        self.assertIsInstance(data["movedCount"], int)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_remove_instance_variable_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|name"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.post(
            "/class-browser/remove-instance-variable",
            json={
                "className": "Object",
                "dictionary": "Globals",
                "variableName": "name",
            },
        )
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "result", "variableName"})
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["result"], str)
        self.assertIsInstance(data["variableName"], str)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_remove_method_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "OK|printString"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.post(
            "/class-browser/remove-method",
            json={"className": "Object", "dictionary": "Globals", "selector": "printString"},
        )
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "result", "selector"})
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["result"], str)
        self.assertIsInstance(data["selector"], str)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_file_out_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "printString ^ 'ok'\n"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.get(
            "/class-browser/file-out?mode=method&class=Object&dictionary=Globals&selector=printString"
        )
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "filename", "source"})
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["filename"], str)
        self.assertIsInstance(data["source"], str)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_class_browser_create_accessors_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "Success"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.post(
            "/class-browser/create-accessors",
            json={"className": "Object", "dictionary": "Globals", "variableName": "name"},
        )
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(
            set(data.keys()),
            {"success", "result", "exception", "category", "getterSelector", "setterSelector"},
        )
        self.assertIs(data["success"], True)
        self.assertEqual(data["exception"], None)
        self.assertIsInstance(data["result"], str)
        self.assertIsInstance(data["category"], str)
        self.assertIsInstance(data["getterSelector"], str)
        self.assertIsInstance(data["setterSelector"], str)

    @patch("gemstone_p.app._debug_object_ref")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_object_constants_contract(self, mock_rs, mock_debug_object_ref):
        session = _mock_session()
        session.eval.return_value = "25\nFoo\tBehavior\t310\n"
        mock_rs.return_value = _mock_request_session(session)
        mock_debug_object_ref.return_value = {
            "oop": 310,
            "inspection": "Behavior",
            "basetype": "class",
            "loaded": False,
        }

        response = self.client.get("/object/constants/12345?limit=20&offset=0")
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(
            set(data.keys()),
            {"success", "constants", "limit", "offset", "total", "hasMore"},
        )
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["constants"], list)
        self.assertEqual(len(data["constants"]), 1)
        item = data["constants"][0]
        self.assertEqual(set(item.keys()), {"key", "value", "valueObject"})
        self.assertIsInstance(item["key"], str)
        self.assertIsInstance(item["value"], str)
        self.assertIsInstance(item["valueObject"], dict)
        self.assertIsInstance(data["limit"], int)
        self.assertIsInstance(data["offset"], int)
        self.assertIsInstance(data["total"], int)
        self.assertIsInstance(data["hasMore"], bool)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_object_hierarchy_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "ProtoObject\t302\tGlobals\nObject\t300\tGlobals\n"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.get("/object/hierarchy/12345")
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "hierarchy"})
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["hierarchy"], list)
        self.assertEqual(len(data["hierarchy"]), 2)
        item = data["hierarchy"][0]
        self.assertEqual(set(item.keys()), {"class", "dictionary"})
        self.assertIsInstance(item["class"], dict)
        self.assertIsInstance(item["dictionary"], str)

    @patch("gemstone_p.app._debug_object_ref")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_object_included_modules_contract(self, mock_rs, mock_debug_object_ref):
        session = _mock_session()
        session.eval.return_value = "25\n300\tObject\t601\tModule1\n"
        mock_rs.return_value = _mock_request_session(session)
        mock_debug_object_ref.side_effect = [
            {"oop": 300, "inspection": "Object", "basetype": "class", "loaded": False},
            {"oop": 601, "inspection": "Module1", "basetype": "module", "loaded": False},
        ]

        response = self.client.get("/object/included-modules/12345?limit=2&offset=0")
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(
            set(data.keys()),
            {"success", "modules", "limit", "offset", "total", "hasMore"},
        )
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["modules"], list)
        self.assertEqual(len(data["modules"]), 1)
        item = data["modules"][0]
        self.assertEqual(set(item.keys()), {"owner", "module"})
        self.assertIsInstance(item["owner"], dict)
        self.assertIsInstance(item["module"], dict)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_object_instances_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "45\n521\tObject instance #21\n522\tObject instance #22\n"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.get("/object/instances/12345?limit=2&offset=20")
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(
            set(data.keys()),
            {"success", "instances", "limit", "offset", "total", "hasMore"},
        )
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["instances"], list)
        self.assertEqual(len(data["instances"]), 2)
        item = data["instances"][0]
        self.assertEqual(set(item.keys()), {"oop", "printString"})
        self.assertIsInstance(item["oop"], int)
        self.assertIsInstance(item["printString"], str)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_object_stone_version_report_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "gsVersion|'3.7.5'\n"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.get("/object/stone-version-report")
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "report"})
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["report"], list)
        self.assertEqual(len(data["report"]), 1)
        item = data["report"][0]
        self.assertEqual(set(item.keys()), {"key", "value"})
        self.assertIsInstance(item["key"], str)
        self.assertIsInstance(item["value"], str)

    @patch("gemstone_p.app.subprocess.run")
    @patch("gemstone_p.app.gs_session.connection_snapshot")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_connection_preflight_contract(self, mock_rs, mock_snapshot, mock_run):
        session = _mock_session()
        session.eval.side_effect = ["3.7.5"] * 10
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

        response = self.client.get("/connection/preflight")
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(
            set(data.keys()),
            {"success", "status", "app", "stone", "gem", "connection"},
        )
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["status"], str)
        self.assertIsInstance(data["app"], str)
        self.assertIsInstance(data["stone"], str)
        self.assertIsInstance(data["gem"], str)
        self.assertEqual(set(data["connection"].keys()), {"configured", "probe", "suggestions"})
        self.assertIsInstance(data["connection"]["configured"], dict)
        self.assertIsInstance(data["connection"]["probe"], dict)
        self.assertIsInstance(data["connection"]["suggestions"], list)

    @patch("gemstone_p.app.subprocess.run")
    @patch("gemstone_p.app.gs_session.connection_snapshot")
    @patch("gemstone_p.app.gs_session.broker_snapshot")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_diagnostics_contract(self, mock_rs, mock_broker_snapshot, mock_snapshot, mock_run):
        session = _mock_session()
        session.eval.side_effect = ["3.7.5"] * 10
        mock_rs.return_value = _mock_request_session(session)
        mock_broker_snapshot.return_value = {
            "defaultAutoBegin": None,
            "managedSessionCount": 1,
            "channels": [{"name": "object:win-1-r", "hasSession": True, "loggedIn": True}],
        }
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
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")

        response = self.client.get("/diagnostics")
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(
            set(data.keys()),
            {"success", "status", "app", "stone", "gem", "runtime", "sessionBroker", "connection"},
        )
        self.assertIs(data["success"], True)
        self.assertEqual(data["status"], "ok")
        self.assertIsInstance(data["runtime"], dict)
        self.assertIn("python", data["runtime"])
        self.assertIsInstance(data["sessionBroker"], dict)
        self.assertIsInstance(data["connection"], dict)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_transaction_commit_contract(self, mock_rs):
        session = _mock_session()
        session.commit.return_value = None
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.post("/transaction/commit", json={})
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "result"})
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["result"], str)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_transaction_set_persistent_mode_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "#autoBegin"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.post("/transaction/persistent-mode", json={"enable": True})
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "persistent", "result"})
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["persistent"], bool)
        self.assertIsInstance(data["result"], str)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_maglev_report_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "Loaded Features Report\n\n1. app/models/user.rb\n"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.get("/maglev/report/loaded-features")
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(
            set(data.keys()),
            {"success", "available", "reportKey", "title", "text"},
        )
        self.assertIs(data["success"], True)
        self.assertIs(data["available"], True)
        self.assertEqual(data["reportKey"], "loaded-features")
        self.assertIsInstance(data["title"], str)
        self.assertIsInstance(data["text"], str)

    @patch("gemstone_p.app.object_view")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_object_index_contract(self, mock_rs, mock_object_view):
        session = _mock_session()
        mock_rs.return_value = _mock_request_session(session)
        mock_object_view.return_value = {
            "oop": 12345,
            "inspection": "Object",
            "basetype": "object",
            "loaded": True,
        }

        response = self.client.get("/object/index/12345")
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "result"})
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["result"], dict)
        self.assertEqual(set(data["result"].keys()), {"oop", "inspection", "basetype", "loaded"})

    @patch("gemstone_p.app.object_view")
    @patch("gemstone_p.app.eval_in_context")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_object_evaluate_exception_contract(self, mock_rs, mock_eval_in_context, mock_object_view):
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
            "inspection": "a ZeroDivide occurred (error 2026), reason:numErrIntDivisionByZero",
            "basetype": "object",
            "loaded": False,
        }

        response = self.client.post(
            "/object/evaluate/20",
            json={"code": "1/0", "language": "smalltalk", "depth": 1},
        )
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "result"})
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["result"], list)
        self.assertEqual(len(data["result"]), 2)
        self.assertIsInstance(data["result"][0], bool)
        self.assertIsInstance(data["result"][1], dict)
        self.assertIn("debugThreadOop", data["result"][1])
        self.assertIn("debugExceptionOop", data["result"][1])
        self.assertIn("exceptionText", data["result"][1])
        self.assertIn("sourcePreview", data["result"][1])
        self.assertIn("autoOpenDebugger", data["result"][1])

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_threads_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "700|a HaltedDemoProcess|a ZeroDivide occurred (error 2026)|1/0"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.get("/debug/threads")
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "threads"})
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["threads"], list)
        self.assertEqual(len(data["threads"]), 1)
        item = data["threads"][0]
        self.assertEqual(
            set(item.keys()),
            {"oop", "printString", "exceptionText", "sourcePreview", "displayText"},
        )
        self.assertIsInstance(item["oop"], int)
        self.assertIsInstance(item["printString"], str)
        self.assertIsInstance(item["exceptionText"], str)
        self.assertIsInstance(item["sourcePreview"], str)
        self.assertIsInstance(item["displayText"], str)

    @patch("gemstone_p.app.object_view")
    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_frame_contract(self, mock_rs, mock_object_view):
        session = _mock_session()
        session.eval.return_value = "Behavior>>helper|17|Behavior|310|helper ^ #done|8|2|result\t77"
        mock_rs.return_value = _mock_request_session(session)
        mock_object_view.side_effect = [
            {"oop": 310, "inspection": "Behavior", "basetype": "class", "loaded": False},
            {"oop": 77, "inspection": "#done", "basetype": "symbol", "loaded": False},
        ]

        response = self.client.get("/debug/frame/700?index=1")
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(
            set(data.keys()),
            {
                "success",
                "methodName",
                "className",
                "selectorName",
                "frameKey",
                "isExecutedCode",
                "ipOffset",
                "selfPrintString",
                "selfObject",
                "source",
                "sourceOffset",
                "stepPoint",
                "lineNumber",
                "status",
                "isLiveSession",
                "hasFrame",
                "canStep",
                "canProceed",
                "canRestart",
                "canTrim",
                "canTerminate",
                "canStepInto",
                "canStepOver",
                "canStepReturn",
                "variables",
                "frameIndex",
            },
        )
        self.assertIs(data["success"], True)
        self.assertIsInstance(data["methodName"], str)
        self.assertIsInstance(data["className"], str)
        self.assertIsInstance(data["selectorName"], str)
        self.assertIsInstance(data["frameKey"], str)
        self.assertIsInstance(data["isExecutedCode"], bool)
        self.assertIsInstance(data["ipOffset"], str)
        self.assertIsInstance(data["selfPrintString"], str)
        self.assertIsInstance(data["selfObject"], dict)
        self.assertIsInstance(data["source"], str)
        self.assertIsInstance(data["sourceOffset"], int)
        self.assertIsInstance(data["stepPoint"], int)
        self.assertIsInstance(data["status"], str)
        self.assertIsInstance(data["isLiveSession"], bool)
        self.assertIsInstance(data["hasFrame"], bool)
        self.assertIsInstance(data["canStep"], bool)
        self.assertIsInstance(data["canProceed"], bool)
        self.assertIsInstance(data["canRestart"], bool)
        self.assertIsInstance(data["canTrim"], bool)
        self.assertIsInstance(data["canTerminate"], bool)
        self.assertIsInstance(data["canStepInto"], bool)
        self.assertIsInstance(data["canStepOver"], bool)
        self.assertIsInstance(data["canStepReturn"], bool)
        self.assertIsInstance(data["lineNumber"], int)
        self.assertIsInstance(data["frameIndex"], int)
        self.assertIsInstance(data["variables"], list)
        self.assertEqual(len(data["variables"]), 1)
        variable = data["variables"][0]
        self.assertEqual(set(variable.keys()), {"name", "value", "valueObject"})
        self.assertIsInstance(variable["name"], str)
        self.assertIsInstance(variable["value"], str)
        self.assertIsInstance(variable["valueObject"], dict)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_step_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "true"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.post("/debug/step/700", json={"index": 2})
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "action", "threadOop", "frameIndex", "message", "status"})
        self.assertIs(data["success"], True)
        self.assertEqual(data["action"], "step")
        self.assertIsInstance(data["status"], str)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_step_into_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "true"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.post("/debug/step-into/700", json={"index": 2})
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "action", "threadOop", "frameIndex", "message", "status"})
        self.assertIs(data["success"], True)
        self.assertEqual(data["action"], "stepInto")
        self.assertIsInstance(data["status"], str)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_step_over_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "true"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.post("/debug/step-over/700", json={"index": 2})
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "action", "threadOop", "frameIndex", "message", "status"})
        self.assertIs(data["success"], True)
        self.assertEqual(data["action"], "stepOver")
        self.assertIsInstance(data["status"], str)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_step_return_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "true"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.post("/debug/step-return/700", json={"index": 2})
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "action", "threadOop", "frameIndex", "message", "status"})
        self.assertIs(data["success"], True)
        self.assertEqual(data["action"], "stepReturn")
        self.assertEqual(data["frameIndex"], 1)
        self.assertIsInstance(data["status"], str)

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_restart_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "true"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.post("/debug/restart/700", json={"index": 1})
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "action", "threadOop", "frameIndex", "message", "status", "completed"})
        self.assertIs(data["success"], True)
        self.assertEqual(data["action"], "restart")

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_terminate_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "true"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.post("/debug/terminate/700", json={})
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "action", "threadOop", "message", "status"})
        self.assertIs(data["success"], True)
        self.assertEqual(data["action"], "terminate")

    @patch("gemstone_p.app.gs_session.request_session")
    def test_debug_trim_contract(self, mock_rs):
        session = _mock_session()
        session.eval.return_value = "true"
        mock_rs.return_value = _mock_request_session(session)

        response = self.client.post("/debug/trim/700", json={"index": 1})
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertEqual(set(data.keys()), {"success", "action", "threadOop", "frameIndex", "message", "status"})
        self.assertIs(data["success"], True)
        self.assertEqual(data["action"], "trim")

import unittest
from unittest.mock import MagicMock, patch

from gemstone_py import OOP_NIL

from gemstone_p import object_view as ov


class TestObjectView(unittest.TestCase):
    def test_behavior_browser_targets_parse_class_and_metaclass_matches(self):
        session = MagicMock()
        session.eval.return_value = "300|Globals|Object|0\n301|Globals|Object|1\n302|Globals|ProtoObject|0\n"

        result = ov._behavior_browser_targets(session, 300, 301, 302)

        self.assertEqual(
            result,
            {
                300: {
                    "oop": 300,
                    "className": "Object",
                    "dictionary": "Globals",
                    "meta": False,
                    "label": "Object",
                },
                301: {
                    "oop": 301,
                    "className": "Object",
                    "dictionary": "Globals",
                    "meta": True,
                    "label": "Object class",
                },
                302: {
                    "oop": 302,
                    "className": "ProtoObject",
                    "dictionary": "Globals",
                    "meta": False,
                    "label": "ProtoObject",
                },
            },
        )

    def test_behavior_object_exposes_exact_class_browser_target(self):
        session = MagicMock()
        session.resolve.return_value = 99999

        with (
            patch.object(ov, "_fetch_meta", side_effect=[
                ("Metaclass3", "Object", 301, "ProtoObject", 302),
                ("Metaclass3 class", "Object class", OOP_NIL, "", OOP_NIL),
            ]),
            patch.object(ov, "_behavior_browser_targets", return_value={
                300: {
                    "oop": 300,
                    "className": "Object",
                    "dictionary": "Globals",
                    "meta": False,
                    "label": "Object",
                },
                301: {
                    "oop": 301,
                    "className": "Object",
                    "dictionary": "Globals",
                    "meta": True,
                    "label": "Object class",
                },
                302: {
                    "oop": 302,
                    "className": "ProtoObject",
                    "dictionary": "Globals",
                    "meta": False,
                    "label": "ProtoObject",
                },
            }),
            patch.object(ov, "_named_inst_vars", return_value=(0, {})),
        ):
            result = ov.object_view(session, 300)

        self.assertEqual(
            result["classBrowserTarget"],
            {
                "oop": 300,
                "className": "Object",
                "dictionary": "Globals",
                "meta": False,
                "label": "Object",
            },
        )
        self.assertEqual(result["classObject"]["dictionary"], "Globals")
        self.assertTrue(result["classObject"]["meta"])
        self.assertEqual(result["superclassObject"]["className"], "ProtoObject")

    def test_maglev_record_metadata_exposes_attributes_tab(self):
        session = MagicMock()
        entry_name = {"oop": None, "inspection": "@maglev_attributes", "basetype": "symbol", "loaded": False}
        entry_value = {"oop": 500, "inspection": "aSymbolDictionary()", "basetype": "hash", "loaded": False}
        attr_entries = {
            1: [
                {"oop": 1001, "inspection": "#'name'", "basetype": "symbol", "loaded": False},
                {"oop": 1002, "inspection": "'Ada'", "basetype": "string", "loaded": False},
            ]
        }

        with (
            patch.object(ov, "_fetch_meta", side_effect=[
                ("UserRecord", "a UserRecord", 200, "", OOP_NIL),
                ("UserRecord class", "UserRecord class", OOP_NIL, "", OOP_NIL),
            ]),
            patch.object(ov, "_named_inst_vars", return_value=(1, {1: [entry_name, entry_value]})),
            patch.object(ov, "_dict_entries", return_value=(1, attr_entries)) as mock_dict_entries,
        ):
            result = ov.object_view(session, 12345)

        self.assertEqual(result["basetype"], "maglevRecordBase")
        self.assertEqual(result["defaultTab"], "attributes")
        self.assertEqual(result["availableTabs"], ["instvars", "attributes"])
        self.assertEqual(
            result["customTabs"],
            [{
                "id": "attributes",
                "caption": "Attributes",
                "kind": "association-dict",
                "field": "attributes",
                "sizeField": "attributesSize",
                "rangeName": "attributes",
                "pageSize": 20,
            }],
        )
        self.assertEqual(result["attributesSize"], 1)
        self.assertEqual(result["attributes"], attr_entries)
        self.assertEqual(mock_dict_entries.call_args[0][1], 500)
        self.assertEqual(mock_dict_entries.call_args[0][2:4], (1, 20))

    def test_maglev_record_attribute_range_is_passed_through(self):
        session = MagicMock()
        entry_name = {"oop": None, "inspection": "@maglev_attributes", "basetype": "symbol", "loaded": False}
        entry_value = {"oop": 500, "inspection": "aSymbolDictionary()", "basetype": "hash", "loaded": False}

        with (
            patch.object(ov, "_fetch_meta", side_effect=[
                ("UserRecord", "a UserRecord", 200, "", OOP_NIL),
                ("UserRecord class", "UserRecord class", OOP_NIL, "", OOP_NIL),
            ]),
            patch.object(ov, "_named_inst_vars", return_value=(1, {1: [entry_name, entry_value]})),
            patch.object(ov, "_dict_entries", return_value=(0, {})) as mock_dict_entries,
        ):
            ov.object_view(session, 12345, ranges={"attributes": [21, 40]})

        self.assertEqual(mock_dict_entries.call_args[0][2:4], (21, 40))

    def test_behavior_metadata_uses_code_default_tab(self):
        session = MagicMock()
        session.resolve.return_value = 99999

        with (
            patch.object(ov, "_fetch_meta", side_effect=[
                ("Metaclass3", "Object", 200, "ProtoObject", 300),
                ("Metaclass3 class", "Object class", OOP_NIL, "", OOP_NIL),
            ]),
            patch.object(ov, "_named_inst_vars", return_value=(0, {})),
        ):
            result = ov.object_view(session, 12345)

        self.assertEqual(result["basetype"], "class")
        self.assertEqual(result["defaultTab"], "code")
        self.assertEqual(result["availableTabs"], ["instvars", "constants", "modules", "code", "hierarchy", "instances"])
        self.assertEqual(result["customTabs"], [])

    def test_system_behavior_metadata_uses_control_default_tab(self):
        session = MagicMock()
        session.resolve.return_value = 76033

        with (
            patch.object(ov, "_fetch_meta", side_effect=[
                ("Metaclass3", "System", 200, "Object", 300),
                ("Metaclass3 class", "System class", OOP_NIL, "", OOP_NIL),
            ]),
            patch.object(ov, "_named_inst_vars", return_value=(0, {})),
        ):
            result = ov.object_view(session, 76033)

        self.assertEqual(result["basetype"], "systemClass")
        self.assertEqual(result["defaultTab"], "control")
        self.assertEqual(
            result["availableTabs"],
            ["instvars", "constants", "modules", "code", "hierarchy", "instances", "stone-ver", "gem-ver", "control"],
        )

    def test_hash_metadata_keeps_only_instance_variables_tab(self):
        session = MagicMock()

        with (
            patch.object(ov, "_fetch_meta", side_effect=[
                ("SymbolDictionary", "aSymbolDictionary()", 200, "", OOP_NIL),
                ("Metaclass3", "SymbolDictionary class", OOP_NIL, "", OOP_NIL),
            ]),
            patch.object(ov, "_dict_entries", return_value=(0, {})),
        ):
            result = ov.object_view(session, 207361)

        self.assertEqual(result["basetype"], "hash")
        self.assertEqual(result["defaultTab"], "instvars")
        self.assertEqual(result["availableTabs"], ["instvars"])

    def test_eval_in_context_treats_pending_gci_error_as_exception_even_when_result_is_nil(self):
        session = MagicMock()

        class FakeLib:
            def GciExecuteStr(self, source, context):
                return OOP_NIL

            def GciErr(self, err_ptr):
                err = err_ptr._obj
                err.number = 2026
                err.context = 700
                err.exceptionObj = 555
                err.message = b"a ZeroDivide occurred (error 2026)"
                err.reason = b"numErrIntDivisionByZero"
                return True

        session._require_login.return_value = FakeLib()

        result = ov.eval_in_context(session, 20, "1/0", "smalltalk")

        self.assertEqual(
            result,
            {
                "isException": True,
                "resultOop": 555,
                "errorText": "a ZeroDivide occurred (error 2026) [numErrIntDivisionByZero]",
                "debugThreadOop": 700,
                "exceptionOop": 555,
            },
        )


if __name__ == "__main__":
    unittest.main()

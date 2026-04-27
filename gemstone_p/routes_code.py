from __future__ import annotations

from flask import jsonify, request


def register_code_routes(
    app,
    *,
    request_session_factory,
    eval_str_fn,
    behavior_prelude_fn,
    encode_src: str,
    escape_st_fn,
    decode_field_fn,
) -> None:
    @app.get("/code/selectors/<int:oop>")
    def code_selectors(oop: int):
        try:
            with request_session_factory() as session:
                raw = eval_str_fn(
                    session,
                    f"| obj behavior encode result |\n"
                    f"{behavior_prelude_fn(oop)}"
                    f"{encode_src}\n"
                    "result := ''.\n"
                    "[behavior categoryNames do: [:cat |\n"
                    "  | selectors |\n"
                    "  selectors := ([behavior selectorsIn: cat] on: Error do: [:e | #()]).\n"
                    "  selectors ifNil: [selectors := #()].\n"
                    "  selectors do: [:sel |\n"
                    "    result := result , 'C|' , (encode value: cat asString) , '|' , (encode value: sel asString) , String lf asString\n"
                    "  ]\n"
                    "]] on: Error do: [:e | ].\n"
                    "[behavior selectors asArray do: [:sel |\n"
                    "  result := result , 'A|' , (encode value: sel asString) , String lf asString\n"
                    "]] on: Error do: [:e | ].\n"
                    "result"
                )
                categories: dict[str, list[str]] = {}
                all_smalltalk: list[str] = []
                for line in str(raw).splitlines():
                    if line.startswith("C|"):
                        _, cat, selector_name = line.split("|", 2)
                        categories.setdefault(decode_field_fn(cat), []).append(decode_field_fn(selector_name))
                    elif line.startswith("A|"):
                        _, selector_name = line.split("|", 1)
                        all_smalltalk.append(decode_field_fn(selector_name))
                result = {
                    category: sorted(set(selectors))
                    for category, selectors in categories.items()
                }
                if all_smalltalk:
                    result["(all Smalltalk)"] = sorted(set(all_smalltalk))
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        return jsonify(success=True, result=result)

    @app.get("/code/code/<int:oop>")
    def code_source(oop: int):
        selector = request.args.get("selector", "")
        try:
            with request_session_factory() as session:
                source = eval_str_fn(
                    session,
                    f"| obj behavior method |\n"
                    f"{behavior_prelude_fn(oop)}"
                    f"method := ([behavior compiledMethodAt: '{escape_st_fn(selector)}' asSymbol ifAbsent: [nil]] on: Error do: [:e | nil]).\n"
                    "method isNil ifTrue: [\n"
                    f"  method := ([behavior lookupSelector: '{escape_st_fn(selector)}' asSymbol] on: Error do: [:e | nil])\n"
                    "].\n"
                    "method isNil ifTrue: [''] ifFalse: [[method sourceString] on: Error do: [:e | '']]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        return jsonify(success=True, result=source)

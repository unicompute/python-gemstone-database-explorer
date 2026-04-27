from __future__ import annotations

from flask import jsonify, request


def register_object_tab_routes(
    app,
    *,
    request_session_factory,
    eval_str_fn,
    behavior_prelude_fn,
    encode_src,
    decode_field_fn,
    debug_object_ref_fn,
    fallback_ref_fn,
) -> None:
    @app.get("/object/constants/<int:oop>")
    def object_constants(oop: int):
        try:
            limit = max(1, min(500, int(request.args.get("limit", 50))))
        except (TypeError, ValueError):
            limit = 50
        try:
            offset = max(0, int(request.args.get("offset", 0)))
        except (TypeError, ValueError):
            offset = 0
        try:
            with request_session_factory() as session:
                raw = eval_str_fn(
                    session,
                    f"| obj behavior result rows assocs total start stop |\n"
                    f"{behavior_prelude_fn(oop)}"
                    f"{encode_src}\n"
                    "rows := OrderedCollection new.\n"
                    "[assocs := [behavior classPool associations asArray] on: Error do: [:e | #()].\n"
                    " assocs := assocs asSortedCollection: [:a :b |\n"
                    "   (([a key asString] on: Error do: [:e | a key printString])\n"
                    "     <= ([b key asString] on: Error do: [:e | b key printString]))\n"
                    " ].\n"
                    " total := assocs size.\n"
                    f" start := {offset} + 1.\n"
                    " start < 1 ifTrue: [start := 1].\n"
                    f" stop := total min: ({offset} + {limit}).\n"
                    " (start <= stop and: [start <= total]) ifTrue: [\n"
                    "   (assocs copyFrom: start to: stop) do: [:assoc |\n"
                    "     | key value keyPs valuePs valueOop |\n"
                    "     key := assoc key.\n"
                    "     value := assoc value.\n"
                    "     keyPs := [key asString] on: Error do: [:e | key printString].\n"
                    "     valuePs := [value printString] on: Error do: [:e | '?'].\n"
                    "     valueOop := [value asOop printString] on: Error do: [:e | '20'].\n"
                    "     rows add: ((encode value: keyPs) , Character tab asString\n"
                    "       , (encode value: valuePs) , Character tab asString\n"
                    "       , (encode value: valueOop))\n"
                    "   ]\n"
                    " ].\n"
                    "result := String streamContents: [:stream |\n"
                    "  stream nextPutAll: total printString.\n"
                    "  rows do: [:line |\n"
                    "    stream nextPut: Character lf.\n"
                    "    stream nextPutAll: line\n"
                    "  ]\n"
                    "].\n"
                    "] on: Error do: [:e | result := '0'].\n"
                    "result"
                )
                lines = str(raw).splitlines()
                total = 0
                if lines:
                    try:
                        total = int(str(lines[0]).strip() or "0")
                    except ValueError:
                        total = 0
                pairs = []
                for line in lines[1:]:
                    if not line.strip():
                        continue
                    fields = line.split("\t", 2)
                    key = decode_field_fn(fields[0]) if len(fields) > 0 else ""
                    value = decode_field_fn(fields[1]) if len(fields) > 1 else ""
                    value_oop_raw = decode_field_fn(fields[2]) if len(fields) > 2 else ""
                    value_object = debug_object_ref_fn(session, value_oop_raw, value)
                    pairs.append(
                        {
                            "key": key,
                            "value": value_object.get("inspection", value),
                            "valueObject": value_object,
                        }
                    )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(
            success=True,
            constants=pairs,
            limit=limit,
            offset=offset,
            total=total,
            hasMore=(offset + len(pairs)) < total,
        )

    @app.get("/object/hierarchy/<int:oop>")
    def object_hierarchy(oop: int):
        try:
            with request_session_factory() as session:
                raw = eval_str_fn(
                    session,
                    f"| obj behavior cls rows result encode |\n"
                    f"{behavior_prelude_fn(oop)}"
                    f"{encode_src}\n"
                    "rows := OrderedCollection new.\n"
                    "cls := behavior.\n"
                    "[cls notNil] whileTrue: [\n"
                    "  | clsName clsOop dictName |\n"
                    "  clsName := [cls name asString] on: Error do: [:e | cls printString].\n"
                    "  clsOop := [cls asOop printString] on: Error do: [:e | '20'].\n"
                    "  dictName := ''.\n"
                    "  [System myUserProfile symbolList do: [:dict |\n"
                    "    ((dictName isEmpty) and: [[dict includesKey: clsName asSymbol] on: Error do: [:e | false]]) ifTrue: [\n"
                    "      | value |\n"
                    "      value := [dict at: clsName asSymbol ifAbsent: [nil]] on: Error do: [:e | nil].\n"
                    "      value == cls ifTrue: [\n"
                    "        dictName := ([dict name] on: Error do: [:e | dict printString]) asString\n"
                    "      ]\n"
                    "    ]\n"
                    "  ]] on: Error do: [:e | ].\n"
                    "  rows addFirst: ((encode value: clsName) , Character tab asString , (encode value: clsOop) , Character tab asString , (encode value: dictName)).\n"
                    "  cls := cls superclass\n"
                    "].\n"
                    "result := String streamContents: [:stream |\n"
                    "  rows doWithIndex: [:line :index |\n"
                    "    index > 1 ifTrue: [stream nextPut: Character lf].\n"
                    "    stream nextPutAll: line\n"
                    "  ]\n"
                    "].\n"
                    "result"
                )
                classes = []
                for line in str(raw).splitlines():
                    if not line.strip():
                        continue
                    fields = line.split("\t", 2)
                    class_name = decode_field_fn(fields[0]) if len(fields) > 0 else ""
                    class_oop_raw = decode_field_fn(fields[1]) if len(fields) > 1 else ""
                    dictionary = decode_field_fn(fields[2]) if len(fields) > 2 else ""
                    try:
                        class_oop = int(class_oop_raw)
                    except ValueError:
                        class_oop = None
                    classes.append(
                        {
                            "class": fallback_ref_fn(class_oop, class_name, "class"),
                            "dictionary": dictionary,
                        }
                    )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, hierarchy=classes)

    @app.get("/object/included-modules/<int:oop>")
    def object_included_modules(oop: int):
        try:
            limit = max(1, min(500, int(request.args.get("limit", 50))))
        except (TypeError, ValueError):
            limit = 50
        try:
            offset = max(0, int(request.args.get("offset", 0)))
        except (TypeError, ValueError):
            offset = 0
        try:
            with request_session_factory() as session:
                raw = eval_str_fn(
                    session,
                    f"| obj behavior result rows total start stop |\n"
                    f"{behavior_prelude_fn(oop)}"
                    f"{encode_src}\n"
                    "result := ''.\n"
                    "[rows := OrderedCollection new.\n"
                    " behavior withAllSuperclasses do: [:cls |\n"
                    "  (cls respondsTo: #includedModules) ifTrue: [\n"
                    "    cls includedModules do: [:m |\n"
                    "      | clsOop clsName modOop modName |\n"
                    "      clsOop := [cls asOop printString] on: Error do: [:e | '20'].\n"
                    "      clsName := [cls name asString] on: Error do: [:e | cls printString].\n"
                    "      modOop := [m asOop printString] on: Error do: [:e | '20'].\n"
                    "      modName := [m name asString] on: Error do: [:e | m printString].\n"
                    "      rows add: ((encode value: clsOop) , Character tab asString\n"
                    "        , (encode value: clsName) , Character tab asString\n"
                    "        , (encode value: modOop) , Character tab asString\n"
                    "        , (encode value: modName))\n"
                    "    ]\n"
                    "  ]\n"
                    " ].\n"
                    " total := rows size.\n"
                    f" start := {offset} + 1.\n"
                    " start < 1 ifTrue: [start := 1].\n"
                    f" stop := total min: ({offset} + {limit}).\n"
                    " result := String streamContents: [:stream |\n"
                    "   stream nextPutAll: total printString.\n"
                    "   (start <= stop and: [start <= total]) ifTrue: [\n"
                    "     (rows copyFrom: start to: stop) do: [:line |\n"
                    "       stream nextPut: Character lf.\n"
                    "       stream nextPutAll: line\n"
                    "     ]\n"
                    "   ]\n"
                    " ].\n"
                    "] on: Error do: [:e | result := '0'].\n"
                    "result"
                )
                lines = str(raw).splitlines()
                total = 0
                if lines:
                    try:
                        total = int(str(lines[0]).strip() or "0")
                    except ValueError:
                        total = 0
                modules = []
                for line in lines[1:]:
                    if not line.strip():
                        continue
                    fields = line.split("\t", 3)
                    owner_oop_raw = decode_field_fn(fields[0]) if len(fields) > 0 else ""
                    owner_name = decode_field_fn(fields[1]) if len(fields) > 1 else ""
                    module_oop_raw = decode_field_fn(fields[2]) if len(fields) > 2 else ""
                    module_name = decode_field_fn(fields[3]) if len(fields) > 3 else ""
                    modules.append(
                        {
                            "owner": debug_object_ref_fn(session, owner_oop_raw, owner_name),
                            "module": debug_object_ref_fn(session, module_oop_raw, module_name),
                        }
                    )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(
            success=True,
            modules=modules,
            limit=limit,
            offset=offset,
            total=total,
            hasMore=(offset + len(modules)) < total,
        )

    @app.get("/object/instances/<int:oop>")
    def object_instances(oop: int):
        try:
            limit = max(1, min(500, int(request.args.get("limit", 50))))
        except (TypeError, ValueError):
            limit = 50
        try:
            offset = max(0, int(request.args.get("offset", 0)))
        except (TypeError, ValueError):
            offset = 0
        try:
            with request_session_factory() as session:
                raw = eval_str_fn(
                    session,
                    f"| obj behavior result col lines total start stop |\n"
                    f"{behavior_prelude_fn(oop)}"
                    f"{encode_src}\n"
                    "result := ''.\n"
                    "[col := behavior allInstances.\n"
                    " total := [col size] on: Error do: [:e | 0].\n"
                    f" start := {offset} + 1.\n"
                    " start < 1 ifTrue: [start := 1].\n"
                    f" stop := total min: ({offset} + {limit}).\n"
                    " lines := OrderedCollection new.\n"
                    " (start <= stop and: [start <= total]) ifTrue: [\n"
                    "   (col copyFrom: start to: stop) do: [:inst |\n"
                    "     | instOop instPs |\n"
                    "     instOop := [inst oop printString] on: Error do: [:e | '20'].\n"
                    "     instPs := [inst printString] on: Error do: [:e | '?'].\n"
                    "     lines add: ((encode value: instOop) , Character tab asString , (encode value: instPs))\n"
                    "   ]\n"
                    " ].\n"
                    " result := String streamContents: [:stream |\n"
                    "   stream nextPutAll: total printString.\n"
                    "   lines do: [:line |\n"
                    "     stream nextPut: Character lf.\n"
                    "     stream nextPutAll: line\n"
                    "   ]\n"
                    " ].\n"
                    "] on: Error do: [:e | result := '0'].\n"
                    "result"
                )
                lines = str(raw).splitlines()
                total = 0
                if lines:
                    try:
                        total = int(str(lines[0]).strip() or "0")
                    except ValueError:
                        total = 0
                instances = []
                for line in lines[1:]:
                    if not line.strip():
                        continue
                    fields = line.split("\t", 1)
                    oop_s = decode_field_fn(fields[0]) if len(fields) > 0 else ""
                    ps = decode_field_fn(fields[1]) if len(fields) > 1 else ""
                    try:
                        instances.append({"oop": int(oop_s), "printString": ps})
                    except ValueError:
                        continue
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(
            success=True,
            instances=instances,
            limit=limit,
            offset=offset,
            total=total,
            hasMore=(offset + len(instances)) < total,
        )

    @app.get("/object/stone-version-report")
    def object_stone_version_report():
        try:
            with request_session_factory() as session:
                raw = eval_str_fn(
                    session,
                    "| result |\n"
                    "result := ''.\n"
                    "[System stoneVersionReport keysAndValuesDo: [:key :value |\n"
                    "  result := result , key asString , '|' , value printString , String lf asString\n"
                    "]] on: Error do: [:e | result := ''].\n"
                    "result"
                )
                pairs = []
                for line in str(raw).splitlines():
                    if "|" in line:
                        k, _, v = line.partition("|")
                        pairs.append({"key": k.strip(), "value": v.strip()})
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, report=pairs)

    @app.get("/object/gem-version-report")
    def object_gem_version_report():
        try:
            with request_session_factory() as session:
                raw = eval_str_fn(
                    session,
                    "| result |\n"
                    "result := ''.\n"
                    "[System gemVersionReport keysAndValuesDo: [:key :value |\n"
                    "  result := result , key asString , '|' , value printString , String lf asString\n"
                    "]] on: Error do: [:e | result := ''].\n"
                    "result"
                )
                pairs = []
                for line in str(raw).splitlines():
                    if "|" in line:
                        k, _, v = line.partition("|")
                        pairs.append({"key": k.strip(), "value": v.strip()})
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, report=pairs)

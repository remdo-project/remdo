import { useDocumentSelector } from "../../DocumentSelector/DocumentSelector";
import ReactJson from "@microlink/react-json-view";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";

type YElement = Y.AbstractType<any>;

const DEFAULTS = {
  list: {
    __dir: "ltr",
    __format: 0,
    __indent: 0,
    __listType: "bullet",
    __start: 1,
    __tag: "ul",
  },
  listitem: {
    __folded: false,
    __format: 0,
    __indent: 0,
    __dir: "ltr",
    __value: null,
  },
  text: {
    __style: "",
    __mode: 0,
    __detail: 0,
    __format: 0,
  },
};

function addUnlessDefault(
  result: object,
  key: string,
  value: any,
  lexicalType: string
) {
  const defaultValue = DEFAULTS[lexicalType]?.[key];
  if (defaultValue !== null && defaultValue !== value) {
    result[key] = value;
  }
}

function yXmlTextToJSON(value: Y.XmlText) {
  const result = { __yType: "XmlText" };
  value.toDelta().forEach((delta: { insert: YElement }) => {
    const sharedType = delta.insert as Y.XmlText;
    const attrs = sharedType.getAttributes && sharedType.getAttributes();
    for (const key in attrs) {
      addUnlessDefault(result, key, attrs[key], attrs["__type"]);
    }

    const children = result["children"] ?? [];
    result["children"] = children;
    children.push(yjsToJSON(delta.insert));
  });

  //flatten if there is only one child
  if (result["children"]?.length === 1) {
    result['child'] = result["children"][0];
    delete result["children"];
  }
  return result;
}

function yMapToJSON(value: Y.Map<any>) {
  const result = new Map();
  result["__yType"] = "Map";

  const lexicalType = value.get("__type");
  value._map.forEach((item, key) => {
    if (!item.deleted) {
      const v = item.content.getContent()[item.length - 1];
      addUnlessDefault(result, key, yjsToJSON(v), lexicalType);
    }
  });
  return result;
}

function yjsToJSON(value: YElement): object {
  let result: object;
  if (value instanceof Y.XmlText) {
    result = yXmlTextToJSON(value);
  } else if (value instanceof Y.Map) {
    result = yMapToJSON(value);
    //} else if (value instanceof Y.XmlElement || value instanceof Y.XmlFragment) {
    //  result = `XML:${value.toString()}`;
    //} else if (value instanceof Y.Array) {
    //  result = `Array:${value.toArray()}`;
  } else {
    result = value;
  }
  return result;
}

export function YjsDebug() {
  const documentSelector = useDocumentSelector();
  const documentElements = useRef(new Map());
  const [documentData, setDocumentData] = useState({});

  const refreshDocumentElements = useCallback(() => {
    const newDocumentElements = documentSelector.getYjsDoc()?.share;

    newDocumentElements?.forEach((value, key) => {
      setDocumentData((prev) => {
        return { ...prev, [key]: yjsToJSON(value) };
      });
    });
    documentElements.current?.forEach((_, key: string) => {
      if (!newDocumentElements.get(key)) {
        setDocumentData((prev) => {
          const newDocumentData = { ...prev };
          delete newDocumentData[key];
          return newDocumentData;
        });
      }
    });
    documentElements.current = newDocumentElements;
  }, [documentSelector, documentElements]);

  useEffect(() => {
    const doc = documentSelector.getYjsDoc();

    doc?.on("update", refreshDocumentElements);
    refreshDocumentElements(); //to show the content when the component is mounted

    return () => {
      doc?.off("update", refreshDocumentElements);
    };
  }, [documentSelector, refreshDocumentElements]);

  return (
    <div>
      <div className="text-white font-weight-bold">Yjs Info</div>
      <div>DocumentID: {documentSelector.documentID}</div>
      <div style={{ fontSize: "0.75rem" }}>
        <ReactJson
          src={documentData}
          name={null}
          displayObjectSize={false}
          displayDataTypes={false}
          quotesOnKeys={false}
          indentWidth={2}
          theme="ashes"
          enableClipboard={false}
          sortKeys={true}
        />
      </div>
      <br />
    </div>
  );
}

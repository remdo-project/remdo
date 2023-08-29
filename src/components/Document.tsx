import * as api from "@/api";
import { useYJSContext } from "@/contexts/YJSContext";
import React, { useEffect, useState } from "react";

const Note = ({ note }: { note: api.Note }) => {
  const [children, setChildren] = useState<api.Note[]>([]);

  useEffect(() => {
    const updateChildren = () => {
      setChildren(note.getChildren());
    };

    updateChildren();

    return note.observe(updateChildren);
  }, [setChildren, note]);

  return (
    <li>
      {note.text}
      <ul>
        {children.map((note) => (
          <Note note={note} key={note.id} />
        ))}
      </ul>
    </li>
  );
};

const Document = () => {
  const { doc } = useYJSContext();

  return (
    <div>
      {doc ? <Note note={api.getDocument(doc)} /> : <div>Loading...</div>}
    </div>
  );
};

export default Document;

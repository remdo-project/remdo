import * as api from "@/api";
import { useYJSContext } from "@/contexts/YJSContext";
import React, { useEffect, useState } from "react";

const Note = ({ note }: { note: api.Note }) => {
  const [children, setChildren] = useState<api.Note[]>([]);

  useEffect(() => {
    const updateChildren = () => {
      console.log("updating: ", note.id, note._y.length);
      setChildren(note.getChildren());
    };

    updateChildren();

    return note.observe(updateChildren);
  }, [setChildren, note]);

  return (
    <li>
      {note.id}: {note.text}
      <ul style={{ border: "1px solid red" }}>
        {children.map((note) => (
          <Note note={note} key={note.id} />
        ))}
      </ul>
    </li>
  );
};

//TODO rename to Document
const Outliner = () => {
  const { doc } = useYJSContext();

  return (
    <div>
      {doc ? <Note note={api.getDocument(doc)} /> : <div>Loading...</div>}
    </div>
  );
};

export default Outliner;

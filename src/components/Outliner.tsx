import { YJSProvider, useYJSContext } from "@/contexts/YJSContext";
import React, { useEffect, useState } from "react";

const Outliner = () => {
  const yjsContext = useYJSContext();
  const [notes, setNotes] = useState<string[]>([]);

  useEffect(() => {
    const ynotes = yjsContext.doc.getArray<string>("notes");

    // Update React state whenever Yjs notes are updated
    const updateNotes = () => {
      //console.log("updateNotes", ynotes.toArray());
      setNotes(ynotes.toArray());
    };

    ynotes.observe(updateNotes);

    updateNotes();

    return () => {
      ynotes.unobserve(updateNotes);
    };
  }, [yjsContext]);

  return (
    <YJSProvider docID="main">
      <ul style={{ border: "1px solid red" }}>
        {notes.map((note, index) => (
          <li key={index}>{note}</li>
        ))}
      </ul>
    </YJSProvider>
  );
};

export default Outliner;

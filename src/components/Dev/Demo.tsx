import "./Demo.scss";
import React from "react";

function Window({ transform = null }) {
  return (
    <div className="window" style={{ transform, float: "left" }}>
      <div className="title">
        <div className="float-start">
          <i className="bi bi-record-fill" />
        </div>
        sample window
      </div>
      <div className="content">
        Window content sample notes
        <br />
        {transform}
      </div>
    </div>
  );
}

export function Demo() {
  return (
    <div>
      <div className="mirror">
        <span className="text">Some text written on the mirror</span>
      </div>
      <br />
      <br />
      <Window transform="perspective(150px) rotateX(0deg) rotateY(10deg)" />
      <br />
      <Window transform="perspective(100px) rotateX(0deg) rotateY(-10deg)" />

      <div className="container my-5">
        <div className="row">
          <div className="col-md-6 offset-md-3">
            <div className="glass-effect p-4">
              <h2 className="text-white">Glass Effect</h2>
              <p className="text-white">
                This is an example of a 3D glass effect using Bootstrap in a
                dark theme.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

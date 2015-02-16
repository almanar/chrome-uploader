/*
* == BSD2 LICENSE ==
* Copyright (c) 2014, Tidepool Project
*
* This program is free software; you can redistribute it and/or modify it under
* the terms of the associated License, which is identical to the BSD 2-Clause
* License as published by the Open Source Initiative at opensource.org.
*
* This program is distributed in the hope that it will be useful, but WITHOUT
* ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
* FOR A PARTICULAR PURPOSE. See the License for more details.
*
* You should have received a copy of the License along with this program; if
* not, you can obtain one from Tidepool Project at tidepool.org.
* == BSD2 LICENSE ==
*/

var _ = require('lodash');
var React = require('react');

var DeviceSelection = React.createClass({
  propTypes: {
    uploads: React.PropTypes.array.isRequired,
    targetId: React.PropTypes.string.isRequired,
    targetDevices: React.PropTypes.array.isRequired,
    onCheckChange: React.PropTypes.func.isRequired,
    onDone: React.PropTypes.func.isRequired
  },

  render: function() {
    var self = this;

    var items = _.map(this.props.uploads, function(upload) {
      return (
        <div key={upload.key} className="Device-checkbox">
          <input type="checkbox"
            value={upload.key}
            ref={upload.key}
            id={upload.key}
            checked={_.contains(self.props.targetDevices, upload.key)}
            onChange={self.props.onCheckChange} />
          <label htmlFor={upload.key}>{upload.name}</label>
        </div>
      );
    });

    var disabled = this.props.targetDevices.length > 0 ? false : true;
    return (
      <div className="DeviceSelection">
        <h3 className="DeviceSelection-headline">Choose devices</h3>
        <form className="DeviceSelection-form">{items}</form>
        <button type="submit"
          className="DeviceSelection-button btn btn-primary"
          onClick={this.handleSubmit}
          disabled={disabled}>
          Done
        </button>
      </div>
    );
  },

  handleSubmit: function() {
    this.props.onDone(this.props.targetId);
  }
});

module.exports = DeviceSelection;

var dexcomDriver = {
    SYNC_BYTE: 0x01,
    CMDS: {
        NULL: { value: 0, name: "NULL" },
        ACK: { value: 1, name: "ACK" },
        NAK: { value: 2, name: "NAK" },
        INVALID_COMMAND: { value: 3, name: "INVALID_COMMAND" },
        INVALID_PARAM: { value: 4, name: "INVALID_PARAM" },
        INCOMPLETE_PACKET_RECEIVED: { value: 5, name: "INCOMPLETE_PACKET_RECEIVED" },
        RECEIVER_ERROR: { value: 6, name: "RECEIVER_ERROR" },
        INVALID_MODE: { value: 7, name: "INVALID_MODE" },
        READ_FIRMWARE_HEADER: { value: 11, name: "Read Firmware Header" },
        READ_DATA_PAGE_RANGE: { value: 16, name: "Read Data Page Range" },
        READ_DATA_PAGES: { value: 17, name: "Read Data Pages" },
        READ_DATA_PAGE_HEADER: { value: 18, name: "Read Data Page Header" }
    },
    RECORD_TYPES: {
        MANUFACTURING_DATA: { value: 0, name: "MANUFACTURING_DATA" },
        FIRMWARE_PARAMETER_DATA: { value: 1, name: "FIRMWARE_PARAMETER_DATA" },
        PC_SOFTWARE_PARAMETER: { value: 2, name: "PC_SOFTWARE_PARAMETER" },
        SENSOR_DATA: { value: 3, name: "SENSOR_DATA" },
        EGV_DATA: { value: 4, name: "EGV_DATA" },
        CAL_SET: { value: 5, name: "CAL_SET" },
        DEVIATION: { value: 6, name: "DEVIATION" },
        INSERTION_TIME: { value: 7, name: "INSERTION_TIME" },
        RECEIVER_LOG_DATA: { value: 8, name: "RECEIVER_LOG_DATA" },
        RECEIVER_ERROR_DATA: { value: 9, name: "RECEIVER_ERROR_DATA" },
        METER_DATA: { value: 10, name: "METER_DATA" },
        USER_EVENT_DATA: { value: 11, name: "USER_EVENT_DATA" },
        USER_SETTING_DATA: { value: 12, name: "USER_SETTING_DATA" },
        MAX_VALUE: { value: 13, name: "MAX_VALUE" }
    },
    TRENDS: {
        NONE: { value: 0, name: "None" },
        DOUBLEUP: { value: 1, name: "DoubleUp" },
        SINGLEUP: { value: 2, name: "SingleUp" },
        FORTYFIVEUP: { value: 3, name: "FortyFiveUp" },
        FLAT: { value: 4, name: "Flat" },
        FORTYFIVEDOWN: { value: 5, name: "FortyFiveDown" },
        SINGLEDOWN: { value: 6, name: "SingleDown" },
        DOUBLEDOWN: { value: 7, name: "DoubleDown" },
        NOTCOMPUTABLE: { value: 8, name: "Not Computable" },
        RATEOUTOFRANGE: { value: 9, name: "Rate Out Of Range" }
    },
    BASE_DATE: new Date(2009, 0, 1).valueOf(),

    getCmdName: function(idx) {
        for (var i in dexcomDriver.CMDS) {
            if (dexcomDriver.CMDS[i].value == idx) {
                return dexcomDriver.CMDS[i].name;
            }
        }
        return "UNKNOWN COMMAND!";
    },

    getTrendName: function(idx) {
        for (var i in dexcomDriver.TRENDS) {
            if (dexcomDriver.TRENDS[i].value == idx) {
                return dexcomDriver.TRENDS[i].name;
            }
        }
        return "UNKNOWN TREND!";
    },

    // builds a command in an ArrayBuffer
    // The first byte is always 0x01 (SYNC), 
    // the second and third bytes are a little-endian payload length.
    // then comes the payload, 
    // finally, it's followed with a 2-byte little-endian CRC of all the bytes
    // up to that point.
    // payload is any indexable array-like object that returns Numbers

    buildPacket: function(command, payloadLength, payload) {
        var datalen = payloadLength + 6;
        var buf = new ArrayBuffer(datalen);
        var bytes = new Uint8Array(buf);
        var ctr = util.pack(bytes, 0, "bsb", dexcomDriver.SYNC_BYTE,
            datalen, command);
        ctr += util.copyBytes(bytes, ctr, payload, payloadLength);
        var crc = crcCalculator.calcDexcomCRC(bytes, ctr);
        util.pack(bytes, ctr, "s", crc);
        return buf;
    },

    readFirmwareHeader: function() {
        return {
            packet: dexcomDriver.buildPacket(
                dexcomDriver.CMDS.READ_FIRMWARE_HEADER.value, 0, null
            ),
            parser: function(packet) {
                data = dexcomDriver.parseXMLPayload(packet);
                dexcomDriver.firmwareHeader = data;
                return data;
            }
        };
    },

    readDataPageRange: function(rectype) {
        return {
            packet: dexcomDriver.buildPacket(
                dexcomDriver.CMDS.READ_DATA_PAGE_RANGE.value, 
                1,
                [rectype.value]
            ),
            parser: function(result) {
                return util.unpack(result.payload, 0, "II", ["lo", "hi"]);
                }
            };
    },

    readDataPages: function(rectype, startPage, numPages) {
        var parser = function(result) {
            var header = util.unpack(result.payload, 0, "IIbbIIIIbb", [
                    "index", "nrecs", "rectype", "revision", 
                    "pagenum", "r1", "r2", "r3", "j1", "j2"
                ]);
            return {
                header: header,
                // data: result.payload.subarray(header.unpack_length)
                data: parse_records(header, result.payload.subarray(header.unpack_length))
            };
        };

        var parse_records = function(header, data) {
            all = [];
            var ctr = 0;
            for (var i = 0; i<header.nrecs; ++i) {
                var rec = util.unpack(data, ctr, "IIsbs", [
                    "systemSeconds", "displaySeconds", "glucose", "trend", "crc"   
                ]);
                rec.glucose &= 0x3FF;
                rec.trend &= 0xF;
                rec.trendText = dexcomDriver.getTrendName(rec.trend);
                rec.systemTime = new Date(dexcomDriver.BASE_DATE + 1000*rec.systemSeconds);
                rec.displayTime = new Date(dexcomDriver.BASE_DATE + 1000*rec.displaySeconds);
                rec.data = data.subarray(ctr, ctr + rec.unpack_length);
                ctr += rec.unpack_length;
                all.push(rec);
            }
            return all;
        };

        var struct = "bIb";
        var len = util.structlen(struct);
        var payload = new Uint8Array(len);
        util.pack(payload, 0, struct, rectype.value, startPage, numPages);

        return {
            packet: dexcomDriver.buildPacket(
                dexcomDriver.CMDS.READ_DATA_PAGES.value, len, payload
            ),
            parser: parser
        };
    },

    readDataPageHeader: function() {
        return {
            packet: dexcomDriver.buildPacket(
                dexcomDriver.CMDS.READ_DATA_PAGE_HEADER.value, 0, null
            ),
            parser: null
        };
    },


    // accepts a stream of bytes and tries to find a dexcom packet
    // at the beginning of it.
    // returns a packet object; if valid == true it's a valid packet
    // if packet_len is nonzero, that much should be deleted from the stream
    // if valid is false and packet_len is nonzero, the previous packet 
    // should be NAKed.
    extractPacket: function(bytestream) {
        var bytes = new Uint8Array(bytestream);
        var packet = { 
            valid: false, 
            packet_len: 0,
            command: 0,
            payload: null, 
            crc: 0
        };

        if (bytes[0] != dexcomDriver.SYNC_BYTE) {
            return packet;
        }

        plen = bytes.length;
        packet_len = util.extractShort(bytes, 1);
        // minimum packet len is 6
        if (packet_len > plen) {
            return packet;  // we're not done yet
        }

        // we now have enough length for a complete packet, so calc the CRC 
        packet.packet_len = packet_len;
        packet.crc = util.extractShort(bytes, packet_len - 2);
        var crc = crcCalculator.calcDexcomCRC(bytes, packet_len - 2);
        if (crc != packet.crc) {
            // if the crc is bad, we should discard the whole packet
            // (packet_len is nonzero)
            return packet;
        }

        // command is the fourth byte, packet is remainder of data
        packet.command = bytes[3];
        packet.payload = new Uint8Array(packet_len - 6);
        for (var i=0; i<packet_len - 6; ++i) {
            packet.payload[i] = bytes[i + 4];
        }

        packet.valid = true;
        return packet;
    },

    // Takes an xml-formatted string and returns an object
    parseXML: function(s) {
        console.log(s);
        result = {tag:'', attrs:{}};
        var tagpat = /<([A-Za-z]+)/;
        var m = s.match(tagpat);
        if (m) {
            result.tag = m[1];
        }
        var gattrpat = /([A-Za-z]+)='([^']+)'/g;
        var attrpat = /([A-Za-z]+)='([^']+)'/;
        m = s.match(gattrpat);
        for (var r in m) {
            var attr = m[r].match(attrpat);
            if (result.attrs[attr[1]]) {
                console.log("Duplicated attribute!");
            }
            result.attrs[attr[1]] = attr[2];
        }
        return result;
    },

    parseXMLPayload: function(packet) {
        if (!packet.valid) {
            return {};
        }
        if (packet.command !== 1) {
            return {};
        }

        var len = packet.packet_len - 6;
        var data = null;
        if (len) {
            data = dexcomDriver.parseXML(
                util.extractString(packet.payload, 0, len));
        }
        return data;
    }
};

// Everything below here was copied over from index.js where it didn't belong -- but
// it hasn't been converted to be part of this file yet.
/*
    // When you call this, it looks to see if a complete Dexcom packet has
    // arrived and it calls the callback with it and strips it from the buffer. 
    // It returns true if a packet was found, and false if not.
    readDexcomPacket: function(callback) {
        // for efficiency reasons, we're not going to bother to ask the driver
        // to decode things that can't possibly be a packet
        // first, discard bytes that can't start a packet
        var discardCount = 0;
        while (serialDevice.buffer.length > 0 && serialDevice.buffer[0] != dexcomDriver.SYNC_BYTE) {
            ++discardCount;
        }
        if (discardCount) {
            serialDevice.discardBytes(discardCount);
        }

        if (serialDevice.buffer.length < 6) { // all complete packets must be at least this long
            return false;       // not enough there yet
        }

        // there's enough there to try, anyway
        var packet = dexcomDriver.extractPacket(serialDevice.buffer);
        if (packet.packet_len !== 0) {
            // remove the now-processed packet
            serialDevice.discardBytes(packet.packet_len);
        }
        callback(packet);
        return true;
    },

    // callback gets a result packet with parsed payload
    var dexcomCommandResponse = function(commandpacket, callback) {
        var processResult = function(result) {
            console.log(result);
            if (result.command != dexcomDriver.CMDS.ACK) {
                console.log("Bad result %d (%s) from data packet", 
                    result.command, dexcomDriver.getCmdName(result.command));
                console.log("Command packet was:");
                bytes = new Uint8Array(commandpacket.packet);
                console.log(bytes);
                console.log("Result was:");
                console.log(result);
            } else {
                // only attempt to parse the payload if it worked
                if (result.payload) {
                    result.parsed_payload = commandpacket.parser(result);
                }
            }
            callback(result);
        };

        var waitloop = function() {
            if (!deviceComms.readDexcomPacket(processResult)) {
                console.log('.');
                setTimeout(waitloop, 100);
            }
        };

        deviceComms.writeSerial(commandpacket.packet, function() {
            console.log("->");
            waitloop();
        });
    };

    var fetchOneEGVPage = function(pagenum, callback) {
        var cmd = dexcomDriver.readDataPages(
            dexcomDriver.RECORD_TYPES.EGV_DATA, pagenum, 1);
        dexcomCommandResponse(cmd, function(page) {
            console.log("page");
            console.log(page.parsed_payload);
            postJellyfish(page.parsed_payload, callback);
        });
    };

    var connectDexcom = function() {
        var cmd = dexcomDriver.readFirmwareHeader();
        dexcomCommandResponse(cmd, function(result) {
            console.log("firmware header");
            deviceInfo = result.parsed_payload.attrs;
            console.log(result);
            var cmd2 = dexcomDriver.readDataPageRange(dexcomDriver.RECORD_TYPES.EGV_DATA);
            dexcomCommandResponse(cmd2, function(pagerange) {
                console.log("page range");
                var range = pagerange.parsed_payload;
                console.log(range);
                var pages = [];
                var lastpage = $("#lastpage").val();
                for (var pg = range.hi-lastpage; pg >= range.lo; --pg) {
                    pages.push(pg);
                }
                async.mapSeries(pages, fetchOneEGVPage, function(err, results) {
                    console.log(results);
                    var sum = 0;
                    for (var i=0; i<results.length; ++i) {
                        sum += results[i];
                    }
                    var msg = sum + " new records uploaded.";
                    if (err == 'STOP') {
                        console.log(msg);
                    } else if (err) {
                        console.log("Error: ", err);
                    } else {
                        console.log(msg);
                    }
                });

            });
        });
    };

*/

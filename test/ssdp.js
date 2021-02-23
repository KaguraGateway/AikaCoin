const { Ssdp } = require("../build/p2p/ssdp/Ssdp");

(async() => {
    const ssdp = new Ssdp();
    console.log(await ssdp.search("urn:schemas-upnp-org:service:WANIPConnection:1"));
})();
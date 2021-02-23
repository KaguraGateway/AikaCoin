console.log("starting");

const t1 = (async() => {
    setInterval(() => {
        console.log("thread1");
    }, 500)
});

const t2 = (async() => {
    console.log("thread2");
    let i=0;
    while(true) {
        i++;
    }
});

console.log("start");

t1();
t2();


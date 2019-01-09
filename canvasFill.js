(() => {
    let canvas;
    let ctx;
    let frameCount = 0;

    let rectState = [0, 0, 10];
    let rectStateVector = [1, 1, 1];

    var img = new Image();
    img.src = "logo.svg";

    function onFrame() {
        window.requestAnimationFrame(onFrame);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        today = new Date();
        var s = today.getSeconds();
        var m = today.getMinutes();
        var h = today.getHours();
        var d = today.getDate()
        var n = today.getMonth() + 1
        var y = today.getYear()

        ctx.drawImage(img, (canvas.width-50), -10, 50, 50);
        
        ctx.fillText(("" + h + ":" + m + ":" + s + " livecodestream.com"), 0, 0);
    }

    document.addEventListener('DOMContentLoaded', (e) => {
        canvas = document.getElementById('canvas-id');

        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight * 4;
        canvas.style.display = "none"


        ctx = canvas.getContext('2d');
        ctx.font = '30px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#fff';



        onFrame();
    });
})();
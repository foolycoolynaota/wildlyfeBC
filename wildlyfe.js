wildlyfe.js

const STEP_LENGTH = 1;
const CELL_SIZE = 10;
const BORDER_WIDTH = 2;
const MAX_FONT_SIZE = 500;
const MAX_MARKED_COUNT = 3;
const CELL_DISTANCE = CELL_SIZE + BORDER_WIDTH;

const BG_COLOR = '#1d2227';
const BORDER_COLOR = '#13191f';
const CELL_HIGHLIGHT = '#328bf6';
const ELECTRON_COLOR = '#00b07c';
const FONT_COLOR = '#ff5353';

const FONT_FAMILY = 'Helvetica, Arial, "Hiragino Sans GB", "Microsoft YaHei", "WenQuan Yi Micro Hei", sans-serif';

const DPR = window.devicePixelRatio || 1;

const ACTIVE_ELECTRONS = [];
const PINNED_CELLS = [];

const MOVE_TRAILS = [
    [0, 1],  // down
    [0, -1], // up
    [1, 0],  // right
    [-1, 0], // left
].map(([x, y]) => [x * CELL_DISTANCE, y * CELL_DISTANCE]);

const END_POINTS_OFFSET = [
    [0, 0], // left top
    [0, 1], // left bottom
    [1, 0], // right top
    [1, 1], // right bottom
].map(([x, y]) => [
    x * CELL_DISTANCE - BORDER_WIDTH / 2,
    y * CELL_DISTANCE - BORDER_WIDTH / 2,
]);

class FullscreenCanvas {
    constructor(disableScale = false) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        this.canvas = canvas;
        this.context = context;
        this.disableScale = disableScale;

        this.resizeHandlers = [];
        this.handleResize = _.debounce(::this.handleResize, 100);

        this.adjust();

        window.addEventListener('resize', this.handleResize);
    }

    adjust() {
        const {
            canvas,
            context,
            disableScale,
        } = this;

        const {
            innerWidth,
            innerHeight,
        } = window;

        this.width = innerWidth;
        this.height = innerHeight;

        const scale = disableScale ? 1 : DPR;

        this.realWidth = canvas.width = innerWidth * scale;
        this.realHeight = canvas.height = innerHeight * scale;
        canvas.style.width = `${innerWidth}px`;
        canvas.style.height = `${innerHeight}px`;

        context.scale(scale, scale);
    }

    clear() {
        const { context } = this;

        context.clearRect(0, 0, this.width, this.height);
    }

    makeCallback(fn) {
        fn(this.context, this);
    }

    composeBackground(background, opacity = 0.1) {
        return this.paint((ctx, { realWidth, realHeight, width, height }) => {
            ctx.save();

            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = opacity;

            ctx.drawImage(background, 0, 0, realWidth, realHeight, 0, 0, width, height);

            ctx.restore();
        });
    }

    paint(fn) {
        if (!_.isFunction(fn)) return;

        this.makeCallback(fn);

        return this;
    }

    repaint(fn) {
        if (!_.isFunction(fn)) return;

        this.clear();

        return this.paint(fn);
    }

    onResize(fn) {
        if (!_.isFunction(fn)) return;

        this.resizeHandlers.push(fn);
    }

    handleResize() {
        const { resizeHandlers } = this;

        if (!resizeHandlers.length) return;

        this.adjust();

        resizeHandlers.forEach(::this.makeCallback);
    }

    renderIntoView(zIndex = 0, target = document.body) {
        const { canvas } = this;

        canvas.style.position = 'absolute';
        canvas.style.left = '0px';
        canvas.style.top  = '0px';
        canvas.style.zIndex = zIndex;

        target.appendChild(canvas);
    }
}

class Electron {
    constructor(
        x = 0,
        y = 0,
        {
            lifeTime = 3 * 1e3,
            speed = STEP_LENGTH,
            color = ELECTRON_COLOR,
        } = {}
    ) {
        this.expireAt = Date.now() + lifeTime;
        this.speed = speed;
        this.color = color;
        this.shadowColor = this.buildShadowColor(color);

        this.radius = BORDER_WIDTH / 2;
        this.current = [x, y];
        this.visited = {};
        this.setDest(this.randomPath());
    }

    buildShadowColor(color) {
        return `rgba(${color.match(/[0-9a-f]{2}/ig).map(hex => parseInt(hex, 16)).join(', ')}, 0.8)`;
    }

    randomPath() {
        const {
            current: [x, y],
        } = this;

        const { length } = MOVE_TRAILS;

        const [deltaX, deltaY] = MOVE_TRAILS[_.random(length - 1)];

        return [
            x + deltaX,
            y + deltaY,
        ];
    }

    composeCoord(coord) {
        return coord.join(',');
    }

    hasVisited(dest) {
        const key = this.composeCoord(dest);

        return this.visited[key];
    }

    setDest(dest) {
        this.destination = dest;
        this.visited[this.composeCoord(dest)] = true;
    }

    next() {
        let {
            speed,
            current,
            destination,
        } = this;

        if (Math.abs(current[0] - destination[0]) <= speed / 2 &&
            Math.abs(current[1] - destination[1]) <= speed / 2
        ) {
            destination = this.randomPath();

            let tryCnt = 1;

            while(this.hasVisited(destination) && tryCnt < 10) {
                tryCnt++;
                destination = this.randomPath();
            }

            this.setDest(destination);
        }

        const deltaX = destination[0] - current[0];
        const deltaY = destination[1] - current[1];

        if (deltaX) {
            current[0] += (deltaX / Math.abs(deltaX) * speed);
        }

        if (deltaY) {
            current[1] += (deltaY / Math.abs(deltaY) * speed);
        }

        return [ ...this.current ];
    }

    paintNextTo({ context } = new FullscreenCanvas) {
        const {
            radius,
            color,
            shadowColor,
        } = this;

        const [x, y] = this.next();

        context.save();

        context.fillStyle = color;
        context.shadowBlur = radius * 5;
        context.shadowColor = shadowColor;
        context.globalCompositeOperation = 'lighter';

        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.closePath();

        context.fill();

        context.restore();
    }
}

class Cell {
    constructor(
        lineIdx = 0,
        rowIndex = 0,
        {
            electronCount = _.random(1, END_POINTS_OFFSET.length - 1),
            background = CELL_HIGHLIGHT,
            electronOptions = {},
        } = {},
    ) {
        this.background = background;
        this.electronCount = electronCount;
        this.electronOptions = electronOptions;
        this.startX = lineIdx * CELL_DISTANCE;
        this.startY = rowIndex * CELL_DISTANCE;
    }

    pin(lifeTime = -1 >>> 1) {
        this.expireAt = Date.now() + lifeTime;

        PINNED_CELLS.push(this);
    }

    scheduleUpdate() {
        this.nextUpdate = Date.now() + _.random(300, 500);
    }

    paintNextTo({ context } = new FullscreenCanvas) {
        const {
            startX,
            startY,
            background,
            nextUpdate,
        } = this;

        if (nextUpdate && Date.now() < nextUpdate) return;

        this.scheduleUpdate();
        this.createElectrons();

        context.save();

        context.globalCompositeOperation = 'lighter';
        context.fillStyle = background;
        context.fillRect(startX, startY, CELL_SIZE, CELL_SIZE);

        context.restore();
    }

    popRandom(arr = []) {
        const ramIdx = _.random(arr.length - 1);

        return arr.splice(ramIdx, 1)[0];
    }

    createElectrons() {
        const {
            startX,
            startY,
            electronCount,
            electronOptions,
        } = this;

        if (!electronCount) return;

        const endpoints = [...END_POINTS_OFFSET];

        for (let i = 0; i < electronCount; i++) {
            const [offsetX, offsetY] = this.popRandom(endpoints);

            ACTIVE_ELECTRONS.push(new Electron(
                startX + offsetX,
                startY + offsetY,
                electronOptions,
            ));
        }
    }
}

const mainLayer = new FullscreenCanvas();
const bgLayer = new FullscreenCanvas();

function iterateItemsIn(list) {
    const now = Date.now();

    for (let i = 0, max = list.length; i < max; i++) {
        const item = list[i];

        if (now >= item.expireAt) {
            list.splice(i, 1);
            i--;
            max--;
        } else {
            item.paintNextTo(mainLayer);
        }
    }
}

function drawMain() {
    iterateItemsIn(PINNED_CELLS);
    iterateItemsIn(ACTIVE_ELECTRONS);
}

function drawGrid(
    ctx = bgLayer.context,
    { width, height } = bgLayer,
) {
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = BORDER_COLOR;

    // horizontal lines
    for (let h = CELL_SIZE; h < height; h += CELL_DISTANCE) {
        ctx.fillRect(0, h, width, BORDER_WIDTH);
    }

    // vertical lines
    for (let w = CELL_SIZE; w < width; w += CELL_DISTANCE) {
        ctx.fillRect(w, 0, BORDER_WIDTH, height);
    }
}

function randomCell(options) {
    const { width, height } = mainLayer;

    const cell = new Cell(
        _.random(width / CELL_DISTANCE),
        _.random(height / CELL_DISTANCE),
        options,
    );

    cell.paintNextTo(mainLayer);
}

bgLayer.paint(drawGrid);
bgLayer.onResize(drawGrid);

mainLayer.paint(drawMain);
mainLayer.onResize(drawMain);

bgLayer.renderIntoView(0);
mainLayer.renderIntoView(1);

function loop() {
    mainLayer.composeBackground(bgLayer.canvas);

    drawMain();

    requestAnimationFrame(loop);
}

loop();

setInterval(
    randomCell,
    1024 / Math.floor(Math.sqrt(mainLayer.width * mainLayer.height)) * 500
);

let clickCount = 0;

const resetClickCount = _.debounce(() => {
    clickCount = 0;
}, 300);

function renderPointer({ clientX, clientY }) {
    if (++clickCount === 10) {
        clickCount = 0;
        mainLayer.clear();
    } else {
        resetClickCount();
    }

    const cell = new Cell(
        Math.floor(clientX / CELL_DISTANCE),
        Math.floor(clientY / CELL_DISTANCE),
        {
            electronCount: 4,
            background: FONT_COLOR,
            electronOptions: {
                speed: 2,
                lifeTime: 1500,
                color: FONT_COLOR,
            }
        }
    );

    cell.paintNextTo(mainLayer);
}

[
    'click',
    'touchstart',
].forEach(evt => {
    document.addEventListener(evt, (evt) => {
        if (evt.touches) {
            Array.from(evt.touches).forEach(renderPointer);
        } else {
            renderPointer(evt);
        }
    });
})

// shape builder

const shape = {
    lastText: '',
    lastMatrix: null,
    appendQueueID: undefined,
    layer: new FullscreenCanvas(true),

    init() {
        this.layer.onResize(() => {
            if (this.lastText) {
                this.print(this.lastText);
            }
        });
    },

    getTextMatrix(
        text,
        {
            fontWeight = 'bold',
            fontFamily = FONT_FAMILY,
        } = {},
    ) {
        const {
            layer,
        } = this;

        const {
            width,
            height,
        } = layer;

        layer.repaint((ctx) => {

            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle';
            ctx.font = `${fontWeight} ${MAX_FONT_SIZE}px ${fontFamily}`;

            const scale = width / ctx.measureText(text).width;
            const fontSize = Math.min(MAX_FONT_SIZE, MAX_FONT_SIZE * scale * 0.8);

            ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

            ctx.fillText(text, width / 2, height / 2);
        });

        const pixels = layer.context.getImageData(0, 0, width, height).data;
        const matrix = [];

        for (let y = 0; y < height; y += CELL_DISTANCE) {
            for (let x = 0; x < width; x += CELL_DISTANCE) {
                const alpha = pixels[(x + y * width) * 4 + 3];

                if (alpha > 0) matrix.push([x, y]);
            }
        }

        return matrix;
    },

    print(text, options) {
        this.clear();

        this.lastText = text;

        const matrix = this.lastMatrix = _.shuffle(this.getTextMatrix(text, options));

        let i = 0, max = matrix.length;

        let markedCount = 0;

        const append = () => {
            const count = _.random(Math.floor(max / 20), Math.floor(max / 10));

            let j = 0;

            while(j < count && i < max) {
                const [x, y] = matrix[i];

                const isMarked = markedCount < MAX_MARKED_COUNT;

                const cell = new Cell(
                    Math.floor(x / CELL_DISTANCE),
                    Math.floor(y / CELL_DISTANCE),
                    {
                        // electronCount: 1, // ff low pref
                        electronCount: isMarked ? 4 : 0,
                        background: FONT_COLOR,
                        electronOptions: {
                            speed: 2,
                            lifeTime: isMarked ? 1000 : 100,
                            color: FONT_COLOR,
                        }
                    }
                );

                cell.paintNextTo(mainLayer);
                cell.pin();

                markedCount++;
                i++;
                j++;
            }

            this.appendQueueID = setTimeout(append, _.random(50, 100));
        }

        append();
    },

    explosion() {
        const {
            lastMatrix,
        } = this;

        const options = {
            electronCount: 4,
            background: FONT_COLOR,
            electronOptions: {
                speed: 2,
                lifeTime: 1000,
                color: FONT_COLOR,
            }
        };

        if (lastMatrix) {
            let max = _.random(Math.floor(lastMatrix.length / 20), Math.floor(lastMatrix.length / 10));

            max = Math.max(20, Math.min(100, max));

            for (let i = 0; i < max; i++) {
                const [x, y] = lastMatrix[i];

                const cell = new Cell(
                    Math.floor(x / CELL_DISTANCE),
                    Math.floor(y / CELL_DISTANCE),
                    options,
                );

                cell.paintNextTo(mainLayer);
            }
        } else {
            const max = _.random(10, 20);

            for (let i = 0; i < max; i++) {
                randomCell(options);
            }
        }
    },

    clear() {
        this.explosion();

        clearTimeout(this.appendQueueID);

        this.appendQueueID = undefined;
        this.lastMatrix = null;
        this.lastText = '';
        PINNED_CELLS.length = 0;
    }
}

shape.init();
shape.print('BBAE');

document.getElementById('input').addEventListener('keypress', ({ keyCode, target }) => {
    if (keyCode === 13) {
        const value = target.value.trim();

        if (value === '#clear') {
            mainLayer.clear();
        }

        if (value) {
            shape.print(value);
        } else {
            shape.clear();
        }

        target.value = '';
    }
});

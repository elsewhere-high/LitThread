/**
 * Wheel-zoom coalescing for the PDF viewer.
 *
 * Trackpad pinch / Ctrl+wheel delivers many small wheel events per second.
 * Applying a zoom step per event re-rasterizes every visible page (main-thread
 * PDFium) once per event. This coalescer applies bounded batches per animation
 * frame, retains fractional input, and cancels stale batches after reset.
 */

/** One discrete zoom step per this much accumulated wheel deltaY. */
const WHEEL_ZOOM_STEP_DELTA = 100;
/** Saturate extreme device input so one frame cannot monopolize the UI thread. */
const MAX_WHEEL_ZOOM_STEPS = 32;

type WheelZoomCoalescerOptions = {
	/** Positive, finite wheel delta per step; invalid values use the default. */
	threshold?: number;
	onZoomIn: () => void;
	onZoomOut: () => void;
	requestFrame?: (callback: FrameRequestCallback) => number;
	cancelFrame?: (handle: number) => void;
};

type WheelZoomCoalescer = {
	/** Accumulate one wheel `deltaY`; steps flush at most once per frame. */
	addDelta(delta: number): void;
	/** Drop pending accumulation (a new gesture starts). */
	reset(): void;
	dispose(): void;
};

export function createWheelZoomCoalescer({
	threshold = WHEEL_ZOOM_STEP_DELTA,
	onZoomIn,
	onZoomOut,
	requestFrame = (callback) => requestAnimationFrame(callback),
	cancelFrame = (handle) => cancelAnimationFrame(handle),
}: WheelZoomCoalescerOptions): WheelZoomCoalescer {
	const stepDelta =
		Number.isFinite(threshold) && threshold > 0
			? threshold
			: WHEEL_ZOOM_STEP_DELTA;
	// Keep native delta units: ten 10-pixel ticks must reach a 100-pixel step
	// without the rounding loss from adding ten fractional 0.1-step values.
	const maxDelta = Math.min(Number.MAX_VALUE, stepDelta * MAX_WHEEL_ZOOM_STEPS);
	let queuedDelta = 0;
	let pendingFrame: number | null = null;
	let disposed = false;
	let revision = 0;

	const flush = (scheduledRevision: number) => {
		if (disposed || scheduledRevision !== revision) return;
		pendingFrame = null;
		const steps = Math.trunc(queuedDelta / stepDelta);
		queuedDelta %= stepDelta;
		const zoom = steps > 0 ? onZoomOut : onZoomIn;
		for (let remaining = Math.abs(steps); remaining > 0; remaining -= 1) {
			if (disposed || revision !== scheduledRevision) break;
			zoom();
		}
	};
	const reset = () => {
		revision += 1;
		queuedDelta = 0;
		if (pendingFrame !== null) cancelFrame(pendingFrame);
		pendingFrame = null;
	};

	return {
		addDelta(delta: number) {
			if (disposed || !Number.isFinite(delta) || delta === 0) return;
			queuedDelta = Math.max(
				-maxDelta,
				Math.min(maxDelta, queuedDelta + delta),
			);
			if (pendingFrame === null) {
				const scheduledRevision = revision;
				pendingFrame = requestFrame(() => flush(scheduledRevision));
			}
		},
		reset,
		dispose() {
			if (disposed) return;
			disposed = true;
			reset();
		},
	};
}

/** Wheel stream must be silent this long before a scroll gesture is over. */
const WHEEL_SCROLL_IDLE_MS = 200;

/**
 * Wheel deltaY units per unit of natural log magnification. A full 2× pinch
 * (ln 2 ≈ 0.69) yields ~690 delta ≈ 7 toolbar-sized zoom steps.
 */
const GESTURE_SCALE_DELTA_GAIN = 1000;

/** Minimal shape of WebKit's non-standard GestureEvent. */
type WebKitGestureEvent = { scale: number; preventDefault(): void };

type WheelZoomGestureOptions = {
	target: Pick<HTMLElement, "addEventListener" | "removeEventListener">;
	/** Ctrl/Cmd+wheel or trackpad pinch tick, already default-prevented when possible. */
	onZoomWheel: (event: WheelEvent) => void;
	/** Wheel-idle delay before plain scrolling is assumed finished. */
	scrollIdleMs?: number;
};

/**
 * Bind wheel-zoom without keeping the container permanently non-passive.
 *
 * A non-passive wheel listener forces every tick through the main thread before
 * the container may scroll, which shows up as scroll jank whenever the viewer is
 * busy. Zoom still needs `preventDefault` (platform pinch zoom would otherwise
 * scale the whole app), so the non-passive listener stays attached until a plain
 * scroll gesture starts and comes back once the wheel stream goes idle. A pinch
 * that begins mid-scroll still zooms; only that first tick keeps its default.
 *
 * On WebKit (Safari / macOS WKWebView) trackpad pinch never arrives as
 * ctrl+wheel; it is delivered as gesturestart/gesturechange/gestureend
 * instead. Those are translated into wheel-equivalent deltas for the same
 * `onZoomWheel` path and default-prevented so the platform magnify is
 * suppressed.
 */
export function bindWheelZoomGesture({
	target,
	onZoomWheel,
	scrollIdleMs = WHEEL_SCROLL_IDLE_MS,
}: WheelZoomGestureOptions): { dispose(): void } {
	let passive = false;
	let idleTimer: ReturnType<typeof setTimeout> | null = null;
	let disposed = false;

	const clearIdleTimer = () => {
		if (idleTimer === null) return;
		clearTimeout(idleTimer);
		idleTimer = null;
	};

	const setPassive = (next: boolean) => {
		if (passive === next) return;
		target.removeEventListener(
			"wheel",
			passive ? passiveListener : activeListener,
		);
		passive = next;
		target.addEventListener("wheel", next ? passiveListener : activeListener, {
			passive: next,
		});
	};

	const handleWheel = (event: WheelEvent, canPreventDefault: boolean) => {
		if (disposed) return;
		if (event.ctrlKey || event.metaKey) {
			if (canPreventDefault && event.cancelable) event.preventDefault();
			clearIdleTimer();
			setPassive(false);
			onZoomWheel(event);
			return;
		}
		setPassive(true);
		clearIdleTimer();
		idleTimer = setTimeout(() => {
			idleTimer = null;
			setPassive(false);
		}, scrollIdleMs);
	};

	function activeListener(event: WheelEvent) {
		handleWheel(event, true);
	}
	function passiveListener(event: WheelEvent) {
		handleWheel(event, false);
	}

	// WebKit (Safari / macOS WKWebView) delivers trackpad pinch as
	// GestureEvents instead of ctrl+wheel ticks; feed the same coalescer with a
	// wheel-equivalent delta derived from the magnification ratio.
	let gestureScale = 1;
	const validScale = (scale: number) => Number.isFinite(scale) && scale > 0;
	const handleGestureStart = (raw: Event) => {
		if (disposed) return;
		const event = raw as unknown as WebKitGestureEvent;
		event.preventDefault();
		gestureScale = validScale(event.scale) ? event.scale : 1;
		clearIdleTimer();
		setPassive(false);
	};
	const handleGestureChange = (raw: Event) => {
		if (disposed) return;
		const event = raw as unknown as WebKitGestureEvent;
		event.preventDefault();
		const scale = event.scale;
		if (!validScale(scale)) return;
		// Log differences avoid overflow when the two finite scales are far apart.
		const magnification = Math.log(scale) - Math.log(gestureScale);
		gestureScale = scale;
		if (magnification === 0) return;
		onZoomWheel({
			deltaY: -GESTURE_SCALE_DELTA_GAIN * magnification,
		} as unknown as WheelEvent);
	};
	const handleGestureEnd = (raw: Event) => {
		if (disposed) return;
		(raw as unknown as WebKitGestureEvent).preventDefault();
		gestureScale = 1;
	};

	target.addEventListener("wheel", activeListener, { passive: false });
	target.addEventListener("gesturestart", handleGestureStart);
	target.addEventListener("gesturechange", handleGestureChange);
	target.addEventListener("gestureend", handleGestureEnd);

	return {
		dispose() {
			if (disposed) return;
			disposed = true;
			clearIdleTimer();
			target.removeEventListener(
				"wheel",
				passive ? passiveListener : activeListener,
			);
			target.removeEventListener("gesturestart", handleGestureStart);
			target.removeEventListener("gesturechange", handleGestureChange);
			target.removeEventListener("gestureend", handleGestureEnd);
		},
	};
}

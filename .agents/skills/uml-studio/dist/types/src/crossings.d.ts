/** Display-only crossings; the routed points and graph topology remain intact. */
interface Point {
    x: number;
    y: number;
}
interface Rect extends Point {
    width: number;
    height: number;
}
interface CrossingPath {
    points: Point[];
    owner: number;
}
/** One upper path per crossing, with transparent masks on the lower paths. */
export declare function crossingPaths(paths: CrossingPath[], mode: 'bridge' | 'plain', lineWidth: number, obstacles?: Rect[]): {
    data: string[];
    masks: string[][];
};
export {};

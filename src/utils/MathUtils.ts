export class MathUtils {
    /**
     * 中央値を配列から求める
     */
    static calculateMedianFromArray(array: Array<number>) {
        if(array.length === 0)
            return 0;

        // 昇順に並べる
        array.sort((a, b) => {
            return a - b;
        });
        // 半分のインデックスを求める
        const halfIndex = (array.length / 2) | 0;
        // インデックスが奇数なら
        if(array.length % 2)
            return array[halfIndex];
        // インデックスが偶数なら
        return (array[halfIndex - 1] + array[halfIndex]) / 2;
    }

    /**
     * 平均値を求める
     */
    static calculateAverageFromArray(array: Array<number>) {
        let average = 0;
        array.forEach((value) => {
            average += value;
        });
        return (average / array.length);
    }

    static orgFloor(value: number, base: number) {
        return Math.floor(value * base) / base;
    }
}

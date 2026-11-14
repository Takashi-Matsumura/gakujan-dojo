/**
 * 符計算の早見表（学雀連ルール）。
 */
const cell = "border border-white/10 px-2 py-1 text-center";

export function FuReference() {
  return (
    <div className="flex flex-col gap-4 text-sm leading-6">
      <div>
        <h3 className="mb-1 font-bold">1. 基本の符</h3>
        <ul className="list-disc pl-5">
          <li>副底（必ずつく）: 20符</li>
          <li>門前でロン: +10符</li>
          <li>ツモ: +2符（平和ツモは除く）</li>
          <li>嵌張・辺張・単騎待ち: +2符（両面・双碰は0符）</li>
        </ul>
      </div>
      <div>
        <h3 className="mb-1 font-bold">2. 雀頭</h3>
        <ul className="list-disc pl-5">
          <li>三元牌・自風・場風: +2符</li>
          <li>連風牌（自風＝場風）: +2符（学雀連ルール。4符にしない）</li>
          <li>数牌・オタ風: 0符</li>
        </ul>
      </div>
      <div>
        <h3 className="mb-1 font-bold">3. 面子（順子は0符）</h3>
        <table className="w-full border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="opacity-70">
              <th className={cell}></th>
              <th className={cell}>中張牌（2〜8）</th>
              <th className={cell}>么九牌（1・9・字）</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["明刻（ポン）", 2, 4],
              ["暗刻", 4, 8],
              ["明槓", 8, 16],
              ["暗槓", 16, 32],
            ].map(([label, a, b]) => (
              <tr key={label as string}>
                <td className={cell}>{label}</td>
                <td className={cell}>{a}符</td>
                <td className={cell}>{b}符</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-xs opacity-70">双碰待ちをロンで和了した刻子は明刻として数える。</p>
      </div>
      <div>
        <h3 className="mb-1 font-bold">4. 合計と例外</h3>
        <ul className="list-disc pl-5">
          <li>合計を10符単位に切り上げる（例: 32符 → 40符）</li>
          <li>平和ツモは20符、平和ロンは30符</li>
          <li>鳴いた手で符が20符のままのロンは30符にする</li>
          <li>七対子は25符固定</li>
        </ul>
      </div>
    </div>
  );
}

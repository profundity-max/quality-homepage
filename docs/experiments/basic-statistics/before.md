# 基础概念
## Mean / σ / Distribution / CI / 正态分布

> **先看懂数据，再谈品质。**

品质工作每天都在和数据打交道。

尺寸平均值是多少？波动有没有变大？100 个样品能不能代表几万片量产？为什么平均值看起来很好，现场却仍然出现不良？

这些问题背后，其实都在回答四件事：

**数据中心在哪里？波动有多大？数据长什么样？我们对这个结论有多大把握？**

对应到统计学，就是：

**Mean、σ、Distribution、Normal Distribution 和 Confidence Interval。**

---

## 1. Mean：过程在哪里？

假设测量 5 个产品的厚度：

**0.98、1.00、1.01、0.99、1.02 mm**

它们的平均值：

**x̄ = 1.00 mm**

Mean 描述的是：

> **一组数据的中心位置。**

但只知道 Mean，还远远不够。

例如：

| | Process A | Process B |
|---|---:|---:|
| Data 1 | 0.99 | 0.80 |
| Data 2 | 1.00 | 0.90 |
| Data 3 | 1.00 | 1.00 |
| Data 4 | 1.00 | 1.10 |
| Data 5 | 1.01 | 1.20 |
| **Mean** | **1.00** | **1.00** |

两个 Process 的 Mean 都是 1.00。

但显然，Process A 比 Process B 稳定得多。

> **Same Mean ≠ Same Process**

平均值只能告诉我们 Process **在哪里**，不能告诉我们 Process **有多稳定**。

---

## 2. σ：过程有多宽？

σ，读作 Sigma，是 **Standard Deviation（标准差）**。

它描述的是：

> **数据围绕平均值的波动程度。**

可以简单理解：

**σ 小 → 数据集中 → Process 波动小**

**σ 大 → 数据分散 → Process 波动大**

假设产品规格是：

**9.0 ~ 11.0 mm**

两个 Process 的平均值都刚好是：

**Mean = 10.0 mm**

但是：

- Process A：σ = 0.1
- Process B：σ = 0.5

Process A 的数据会集中在 10 附近。

Process B 则会散得更开，更容易靠近甚至超过规格边界。

这也是为什么品质工程不能只看 Average。

客户最终拿到的，不是一个“平均产品”，而是一片一片真实的产品。

> **Mean 决定过程的位置，σ 决定过程的宽度。**

这是理解 SPC、Cp、Cpk、MSA 等品质工具的重要基础。

---

## 3. Distribution：数据真正长什么样？

即使知道 Mean 和 σ，也不代表已经真正理解了数据。

我们还要看：

**Distribution——分布。**

Distribution 描述的是：

> **数据在不同数值位置上是如何出现的。**

制造业常见的数据形态并不只有一种。

| Distribution | 特征 | 可能意味着什么 |
|---|---|---|
| Normal | 左右近似对称、集中在中心 | 单一过程的随机波动 |
| Skewed | 明显向某一侧拖尾 | 数据存在边界、非线性或特殊机制 |
| Bimodal | 出现两个明显峰值 | 可能混合了两个不同 Process |

其中尤其值得警惕的是：

### Bimodal——双峰分布

如果一批数据出现两个明显的峰，就应该继续拆分：

- Machine A / Machine B？
- Cavity 1 / Cavity 2？
- Day Shift / Night Shift？
- Supplier A / Supplier B？
- Lot A / Lot B？

有时候整体平均值看起来完全正常，但把数据拆开以后，真正的问题会立刻暴露。

> **异常的 Distribution，往往意味着数据背后存在不同的数据生成机制。**

所以拿到一组品质数据，不要只问：

**Average 是多少？**

还应该问：

**这些数据真的来自同一个 Process 吗？**

---

## 4. Normal Distribution：为什么品质领域经常使用？

品质工程中最常见的统计模型之一，就是：

**Normal Distribution——正态分布。**

它最典型的特点是：

- 中间的数据最多
- 距离中心越远，数据越少
- 整体左右近似对称

正态分布主要由两个参数描述：

**μ → Center**

**σ → Spread**

也就是说：

> **μ 决定分布在哪里，σ 决定分布有多宽。**

如果数据近似服从 Normal Distribution，就存在一个非常重要的规律：

| 范围 | 大约包含的数据 |
|---|---:|
| μ ± 1σ | 68% |
| μ ± 2σ | 95% |
| μ ± 3σ | 99.7% |

这就是著名的：

**68–95–99.7 Rule**

它给品质工程师建立了一个非常重要的统计直觉：

> **如果 Process 稳定，大多数正常波动应该集中在 Mean 附近，越远离中心的数据越少。**

这也是很多 SPC 和 Control Chart 思想背后的统计基础。

---

## 5. 不要默认所有数据都是 Normal

Normal Distribution 很重要。

但现实世界并不总是 Normal。

不同的数据生成机制，可能适合完全不同的 Distribution。

| 数据类型 | 常见统计模型 |
|---|---|
| 稳定制造尺寸 | Normal |
| 产品寿命 / 可靠性 | Weibull |
| 单位产品中的缺陷数量 | Poisson |
| Pass / Fail | Binomial |

所以品质分析中一个常见的误区是：

> **“怎么证明我的数据是 Normal？”**

更好的问题应该是：

> **“什么 Distribution 最合理地描述这个 Process？”**

统计模型应该用来描述现实。

而不是为了方便计算，强迫现实服从某一个模型。

---

## 6. Sample 与 CI：100 个产品能代表 10 万个吗？

假设一天生产：

**100,000 pcs**

我们通常不可能把所有产品全部测完。

于是可能从中抽：

**100 pcs**

这里：

- 100,000 pcs = **Population（总体）**
- 100 pcs = **Sample（样本）**

品质统计经常在做的一件事情，就是：

**Sample → 观察有限数据 → 推断 Population**

例如抽取 100 pcs，得到：

**Sample Mean = 10.02 mm**

这并不意味着整个 Population 的真实平均值就一定等于 10.02 mm。

如果重新抽另外 100 pcs，可能得到：

- 10.00 mm
- 10.03 mm
- 10.01 mm

为什么？

因为：

> **Sampling 本身也存在随机波动。**

因此，相比只报告：

**Mean = 10.02 mm**

更完整的信息可能是：

**Estimated Mean = 10.02 mm**

**95% CI = 9.98 ~ 10.06 mm**

这里的 CI，就是：

**Confidence Interval——置信区间。**

它告诉我们：

> **基于当前 Sample，我们对 Population 参数的估计有多精确。**

先记住三个最重要的关系：

| 变化 | CI 的变化 | 意义 |
|---|---|---|
| Variation ↑ | CI 变宽 | 不确定性增加 |
| Sample Size ↑ | CI 变窄 | 估计更精确 |
| Confidence Level ↑ | CI 变宽 | 对覆盖真实值要求更高 |

所以增加 Sample Size 的真正价值，并不是简单地让数据“更多”。

而是：

> **降低我们利用 Sample 推断 Population 时的不确定性。**

---

## 7. 最后，只记住五件事

| 概念 | 它在回答什么问题？ |
|---|---|
| **Mean** | Process 在哪里？ |
| **σ** | Process 有多宽？ |
| **Distribution** | 数据长什么样？ |
| **Normal Distribution** | 正常随机波动可能如何分布？ |
| **CI** | 我们对估计有多大把握？ |

如果拿到一组品质数据，只看 Average，然后直接判断 Good / Bad，通常还远远不够。

真正应该继续问的是：

> **中心在哪里？**
>
> **波动有多大？**
>
> **Distribution 是什么形状？**
>
> **这个结论又有多可靠？**

这才是品质统计真正的起点。

---

## 一句话总结

> **Mean 看中心，σ 看波动，Distribution 看形状，Normal Distribution 帮助我们理解随机波动，CI 衡量我们对估计的把握。**

---

## 图解：
![图片说明](/uploads/cf1a5aab-6b30-4fe1-bef2-519589702f37.png)


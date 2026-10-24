# Kubernetes 入门介绍

## page: cover layout: cover

### title: text

Kubernetes 入门

### subtitle: text

核心概念与一次应用部署

### meta: text

技术分享 · 本地模板示例

### image: image

{"src": "images/hero.png", "fit": "cover", "alt": "封面配图"}

## page: toc layout: agenda

### title: text

目录

### items: array

- 01 || Kubernetes 是什么
- 02 || 集群架构
- 03 || 资源对象
- 04 || 应用部署
- 05 || 运维机制
- 06 || 实践路径

## page: overview layout: title_body

### title: text

Kubernetes 是什么

### body: text

<span style="font-family: Arial; color: #2563EB; font-weight: bold">Kubernetes</span> 是容器编排系统，常简称 K8S。
它协调多个节点上的容器化应用。
- [✓; #E85A2E] 部署应用并管理副本
- [✓; #E85A2E] 为服务提供稳定访问方式
- [✓; #E85A2E] 在故障后恢复期望状态
容器封装运行环境，K8S 管理容器的运行。

## page: architecture layout: title_body

### title: text

集群的两类节点

### body: text

**控制平面**管理集群状态与调度决策。
- API Server：集群管理入口
- etcd：保存集群状态
- Scheduler：为待运行的 Pod 选择节点
- Controller：推动实际状态接近期望状态
**工作节点**承载业务 Pod。
kubelet 协调运行，容器运行时启动容器。

## page: objects layout: table

### title: text

常见资源对象

### data: table

| 对象 | 主要用途 | 例子 |
| --- | --- | --- |
| **Pod** | 容器运行单元 | 一个应用实例 |
| Deployment | 管理副本与更新 | 三个服务副本 |
| Service | 提供稳定访问入口 | 集群内服务名 |
| ConfigMap | 保存非敏感配置 | 应用配置项 |
| PVC | 申请持久存储 | 数据卷申请 |

## page: capabilities layout: cards

### title: text

Kubernetes 核心能力

### subtitle: text

声明式管理下的四类能力

### row_a: array

- ▶ || 应用部署 || 声明镜像与副本数，控制器维持期望状态
- ⇄ || 服务发现 || 标签选择 Pod，提供稳定访问入口
- ▤ || 配置存储 || ConfigMap 与 PVC 管理配置和数据卷
- ✚ || 弹性伸缩 || HPA 依据指标自动调整副本数

## page: pod_deployment layout: title_body

### title: text

Pod 与 Deployment

### body: text

**Pod** 是 Kubernetes 的最小部署单元。
一个 Pod 可包含紧密协作的多个容器。
Pod 内容器共享网络和声明的存储卷。
**Deployment** 管理无状态应用的副本与更新。
通过 ReplicaSet 维持期望的 Pod 数量。
业务通常创建 Deployment，而非手工维护 Pod。

## page: networking layout: title_body

### title: text

Service 与应用访问

### body: text

Pod 可能重建，Pod IP 不适合作为固定入口。
**Service** 通过标签选择一组 Pod。
ClusterIP 类型提供集群内部访问入口。
外部访问可用 LoadBalancer 或 Ingress。
LoadBalancer 的实现取决于集群基础设施。
Ingress 需要控制器，常用于 HTTP/HTTPS 路由。

## page: deploy layout: title_body

### title: text

一次应用部署

### body: text

1. 构建镜像并推送到内网镜像仓库。
2. 编写 Deployment，声明镜像和副本数。
3. 编写 Service，为应用提供访问入口。
4. 用 kubectl apply 提交资源声明。
5. 检查 Pod 状态、日志和服务访问。
镜像拉取权限与资源配额应在部署前准备。

## page: numbers layout: stats

### title: text

为什么要容器编排

### subtitle: text

规模化运维带来的量化收益

### items: array

- 80% || 发布耗时下降 || 声明式部署替代手工操作
- 3 倍 || 故障恢复提速 || 控制器自动补齐副本
- 50% || 资源利用率提升 || 调度器统一分配节点资源

## page: operations layout: title_body

### title: text

副本、更新与故障恢复

### body: text

**扩缩容**通过调整期望副本数实现。
HPA 可依据指标调整副本，需要指标来源。
Deployment 支持滚动更新与版本回退。
- [✓] readiness 探针决定 Pod 是否接收流量
- [▶] liveness 探针失败可触发容器重启
节点故障时，控制器尝试补齐所需副本。
这些机制不能替代应用容错和数据备份。

## page: configuration layout: title_body

### title: text

配置、密钥与存储

### body: text

ConfigMap 保存非敏感配置。
**Secret** 保存敏感数据，访问需要权限控制。
Secret 的 Base64 编码不等于加密。
持久化应用通常通过 PVC 申请存储。
StatefulSet 管理需要稳定身份的应用实例。
使用 Namespace 组织资源，并结合 RBAC 授权。
Namespace 本身不提供完整的安全隔离。

## page: recap layout: title_body

### title: text

初学者的实践顺序

### body: text

1) 先理解 Pod、Deployment 和 Service。
2) 在测试集群部署一个简单的无状态服务。
3) 观察副本扩容、滚动更新和故障恢复。
4) 再补充配置、探针、资源限制和持久存储。
生产环境还需要监控、日志、备份与权限治理。
本演示聚焦通用概念，不绑定特定 K8S 版本。

## page: closing layout: closing

### title: text

谢谢观看

### subtitle: text

问题与讨论

### meta: text

由 local-ppt-template 本地生成

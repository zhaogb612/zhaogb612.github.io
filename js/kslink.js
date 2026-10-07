// 复制文本到剪贴板（带降级方案）
function copyText(text, done) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done).catch(() => legacyCopy(text, done));
        return;
    }
    legacyCopy(text, done);
}

function legacyCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:-9999px;opacity:0;";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { window.prompt("请手动复制以下内容：", text); }
    document.body.removeChild(ta);
}

var leonus = {
    linkCom: e => {
        var text = "bf" == e
            ? "```yml\n- name: \n  link: \n  avatar: \n  descr: \n  siteshot: \n```"
            : "站点名称：\n站点地址：\n头像链接：\n站点描述：\n站点截图：";

        // 页面若配置了评论系统，直接填入评论框
        var t = document.querySelector(".el-textarea__inner");
        if (t) {
            t.value = text;
            t.focus();
            return;
        }

        // 未配置评论系统：复制到剪贴板，粘贴到邮件 / QQ 里填写
        copyText(text, () => window.alert("申请格式已复制，粘贴到邮件或 QQ 中填写即可 (๑•̀ㅂ•́)و✧"));
    },
    owoBig: () => {
        if (!document.getElementById("post-comment") || document.body.clientWidth < 768) return;
        let e = 1,
            t = "",
            o = document.createElement("div"),
            n = document.querySelector("body");
        o.id = "owo-big", n.appendChild(o), new MutationObserver((l => {
            for (let a = 0; a < l.length; a++) {
                let i = l[a].addedNodes,
                    s = "";
                if (2 == i.length && "OwO-body" == i[1].className) s = i[1];
                else {
                    if (1 != i.length || "tk-comment" != i[0].className) continue;
                    s = i[0]
                }
                s.onmouseover = l => {
                    e && ("OwO-body" == s.className && "IMG" == l.target.tagName || "tk-owo-emotion" == l.target.className) && (e = 0, t = setTimeout((() => {
                        let e = 3 * l.path[0].clientHeight,
                            t = 3 * l.path[0].clientWidth,
                            a = l.x - l.offsetX - (t - l.path[0].clientWidth) / 2,
                            i = l.y - l.offsetY;
                        a + t > n.clientWidth && (a -= a + t - n.clientWidth + 10), a < 0 && (a = 10), o.style.cssText = `display:flex; height:${e}px; width:${t}px; left:${a}px; top:${i}px;`, o.innerHTML = `<img src="${l.target.src}">`
                    }), 300))
                }, s.onmouseout = () => {
                    o.style.display = "none", e = 1, clearTimeout(t)
                }
            }
        })).observe(document.getElementById("post-comment"), {
            subtree: !0,
            childList: !0
        })
    },
};
// ==================== Supabase 初始化 ====================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ⚠️ 关键修复：
// - REST API（读写商品数据）→ 走 Cloudflare Worker 代理
// - Storage（图片上传）→ 直接走真实 Supabase URL（Worker 不转发 Storage）
// - Realtime（实时监听）→ 直接走真实 Supabase URL（Worker 不转发 WebSocket）

const WORKER_URL = 'https://black-brook-8bb8.wang192515.workers.dev'; // Cloudflare Worker（代理 REST）
const SUPABASE_REAL_URL = 'https://ixyzmvyfclaxvmritrxa.supabase.co'; // 真实 Supabase（Storage + Realtime）
const SUPABASE_ANON_KEY = 'sb_publishable_FbpCE5UvEnCmuFcpRXMj5Q_hsFjm_ys';

// 主客户端：REST 走 Worker 代理（解决 CORS 问题）
const supabase = createClient(WORKER_URL, SUPABASE_ANON_KEY);

// 备用客户端：Storage 和 Realtime 直接走真实 Supabase
const supabaseDirect = createClient(SUPABASE_REAL_URL, SUPABASE_ANON_KEY);

// ==================== 卖家入口控制 ====================
const sellerSection = document.getElementById("sellerSection");
const sellerEntryBtn = document.getElementById("sellerEntryBtn");

sellerEntryBtn.addEventListener("click", () => {
  const password = prompt("请输入卖家密码：");
  if (password === "192515") {
    sellerSection.style.display = "block";
    sellerEntryBtn.style.display = "none";
    window.isSeller = true;
  } else if (password !== null) {
    alert("密码错误！");
  }
});

window.hideSellerSection = function () {
  sellerSection.style.display = "none";
  sellerEntryBtn.style.display = "inline-block";
  window.isSeller = false;
};

// ==================== 页面初始化 ====================
document.addEventListener("DOMContentLoaded", () => {
  loadProducts();

  document.getElementById("imageInput").addEventListener("change", function (e) {
    const file = e.target.files[0];
    const preview = document.getElementById("preview");
    if (file) {
      preview.src = URL.createObjectURL(file);
      preview.style.display = "block";
    }
  });

  // ⭐ Realtime 监听：直接走真实 Supabase（Worker 不支持 WebSocket）
  supabaseDirect
    .channel('products-channel')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'products' },
      (payload) => {
        console.log('实时新增商品:', payload.new);
        prependProduct(payload.new);
      }
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'products' },
      (payload) => {
        console.log('实时删除商品 ID:', payload.old.id);
        const el = document.getElementById(`product-${payload.old.id}`);
        if (el) el.remove();
      }
    )
    .subscribe((status) => {
      console.log('Realtime 状态:', status);
    });
});

// ==================== 加载所有商品 ====================
async function loadProducts() {
  const container = document.getElementById("products");
  container.innerHTML = '<p style="color:gray;">正在加载商品...</p>';

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('id', { ascending: false });

  if (error) {
    console.error("加载商品失败:", error);
    container.innerHTML = `
      <div style="color:red; border:1px solid red; padding:15px; border-radius:8px;">
        <strong>❌ 加载商品失败</strong><br>
        错误信息：${error.message}<br>
        <small>请检查：1）Cloudflare Worker 是否正常运行 2）Supabase RLS 策略是否允许 SELECT</small>
      </div>`;
    return;
  }

  container.innerHTML = "";
  if (data.length === 0) {
    container.innerHTML = '<p style="color:gray;">暂无商品，卖家可以添加新商品。</p>';
    return;
  }
  data.forEach(product => renderProduct(product, container, false));
}

// ==================== 渲染商品卡片 ====================
function renderProduct(product, container, prepend = false) {
  const div = document.createElement("div");
  div.className = "product";
  div.id = `product-${product.id}`;

  let imgTag = "";
  if (product.image) {
    imgTag = `<img src="${escapeHtml(product.image)}" width="200" onerror="this.style.display='none'" style="border-radius:6px;">`;
  }

  const deleteButton = window.isSeller
    ? `<button onclick="deleteProduct(${product.id})" style="background:#e53935;color:white;margin-left:8px;">删除</button>`
    : '';

  div.innerHTML = `
    <div>
      <h3>${escapeHtml(product.name)}</h3>
      ${imgTag}
      <p><strong>价格：</strong>¥${product.price}</p>
      ${product.category ? `<p><strong>分类：</strong>${escapeHtml(product.category)}</p>` : ''}
      ${product.description ? `<p>${escapeHtml(product.description)}</p>` : ''}
      <button onclick="addToCart(${product.id})">加入购物车</button>
      ${deleteButton}
    </div>
  `;

  if (prepend) {
    container.prepend(div);
  } else {
    container.appendChild(div);
  }
}

function prependProduct(product) {
  const container = document.getElementById("products");
  renderProduct(product, container, true);
}

// ==================== 上传图片（直接走真实 Supabase Storage） ====================
async function uploadImageToSupabase(file) {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
  const filePath = `public/${fileName}`;

  // ✅ 用 supabaseDirect（真实 URL）上传图片，Worker 不转发 Storage 请求
  const { data, error } = await supabaseDirect.storage
    .from('product-images')
    .upload(filePath, file, { cacheControl: '3600', upsert: false });

  if (error) {
    console.error("图片上传失败:", error);
    return null;
  }

  const { data: { publicUrl } } = supabaseDirect.storage
    .from('product-images')
    .getPublicUrl(filePath);

  return publicUrl;
}

// ==================== 发布商品 ====================
window.publishProduct = async function () {
  const name = document.getElementById("name").value.trim();
  const price = document.getElementById("price").value;
  const category = document.getElementById("category").value.trim();
  const description = document.getElementById("description").value.trim();
  const fileInput = document.getElementById("imageInput");
  const statusEl = document.getElementById("uploadStatus");

  if (!name || !price) {
    alert("请填写商品名称和价格");
    return;
  }

  let imageUrl = "";
  if (fileInput.files.length > 0) {
    statusEl.textContent = "正在上传图片...";
    statusEl.style.color = "gray";
    imageUrl = await uploadImageToSupabase(fileInput.files[0]);
    if (!imageUrl) {
      statusEl.textContent = "❌ 图片上传失败（检查 Storage 桶权限或 CORS 设置）";
      statusEl.style.color = "red";
      // 如果希望没有图片也能发布，删除下面这行
      return;
    }
    statusEl.textContent = "✅ 图片上传成功";
    statusEl.style.color = "green";
  }

  const { error } = await supabase
    .from('products')
    .insert([{ name, price: parseFloat(price), category, description, image: imageUrl }]);

  if (error) {
    alert("添加商品失败：" + error.message);
    return;
  }

  alert("商品发布成功！");
  document.getElementById("name").value = "";
  document.getElementById("price").value = "";
  document.getElementById("category").value = "";
  document.getElementById("description").value = "";
  fileInput.value = "";
  document.getElementById("preview").style.display = "none";
  statusEl.textContent = "";
};

// ==================== 删除商品 ====================
window.deleteProduct = async function (id) {
  if (!confirm('确定要删除这个商品吗？')) return;

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);

  if (error) {
    alert('删除失败：' + error.message);
    return;
  }

  const el = document.getElementById(`product-${id}`);
  if (el) el.remove();
  alert('商品已删除');
};

// ==================== 购物车 ====================
window.addToCart = function (id) {
  alert("已加入购物车: " + id);
};

// ==================== 防 XSS ====================
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
  }

//git add .
//git commit -m "修改说明"
//git push

//D：
//cd D:\pycharm\camera-shop\frontend

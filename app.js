// ==================== Supabase 初始化 ====================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ⚠️ 替换成你的真实凭证（从 Supabase Settings -> API 中复制）
const SUPABASE_URL = 'https://ixyzmvfclaxvmritrxa.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_FbpCE5UvEnCmuFcpRXMj5Q_hsFjm_ys';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==================== 卖家入口控制（密码验证保留） ====================
const sellerSection = document.getElementById("sellerSection");
const sellerEntryBtn = document.getElementById("sellerEntryBtn");

sellerEntryBtn.addEventListener("click", () => {
  const password = prompt("请输入卖家密码：");
  if (password === "192515") {
    sellerSection.style.display = "block";
    sellerEntryBtn.style.display = "none";
  } else if (password !== null) {
    alert("密码错误！");
  }
});

// 退出卖家模式
window.hideSellerSection = function() {
  sellerSection.style.display = "none";
  sellerEntryBtn.style.display = "inline-block";
};

// ==================== 页面初始化 ====================
document.addEventListener("DOMContentLoaded", () => {
  // 加载已有商品
  loadProducts();

  // 图片预览
  document.getElementById("imageInput").addEventListener("change", function(e) {
    const file = e.target.files[0];
    const preview = document.getElementById("preview");
    if (file) {
      preview.src = URL.createObjectURL(file);
      preview.style.display = "block";
    }
  });

  // ⭐ 开启实时监听：一旦有新的 INSERT 就自动添加到页面
  supabase
    .channel('products-channel')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'products' },
      (payload) => {
        console.log('实时新增商品:', payload.new);
        prependProduct(payload.new);
      }
    )
    .subscribe();
});

// ==================== 加载所有商品（从 Supabase 读取） ====================
async function loadProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('id', { ascending: false });  // 如果你有 created_at 字段，可换成 .order('created_at', ...)

  if (error) {
    console.error("加载商品失败:", error.message);
    document.getElementById("products").innerText = "加载商品失败，请检查网络或 RLS 策略。";
    return;
  }

  const container = document.getElementById("products");
  container.innerHTML = "";
  data.forEach(product => renderProduct(product, container, false));
}

// ==================== 渲染单个商品卡片 ====================
function renderProduct(product, container, prepend = false) {
  const div = document.createElement("div");
  div.className = "product";
  div.id = `product-${product.id}`;

  let imgTag = "";
  if (product.image) {
    imgTag = `<img src="${escapeHtml(product.image)}" width="200" onerror="this.style.display='none'">`;
  }

  div.innerHTML = `
    <div>
      <h3>${escapeHtml(product.name)}</h3>
      ${imgTag}
      <p>价格: ¥${product.price}</p>
      <p>${escapeHtml(product.category || '')}</p>
      <p>${escapeHtml(product.description || '')}</p>
      <button onclick="addToCart(${product.id})">加入购物车</button>
    </div>
  `;

  if (prepend) {
    container.prepend(div);
  } else {
    container.appendChild(div);
  }
}

// 实时监听时使用，插入到列表顶部
function prependProduct(product) {
  const container = document.getElementById("products");
  renderProduct(product, container, true);
}

// ==================== 上传图片到 Supabase Storage ====================
async function uploadImageToSupabase(file) {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
  const filePath = `public/${fileName}`;

  const { data, error } = await supabase.storage
    .from('product-images')    // 你的存储桶名称
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (error) {
    console.error("图片上传失败:", error.message);
    return null;
  }

  const { data: { publicUrl } } = supabase.storage
    .from('product-images')
    .getPublicUrl(filePath);

  return publicUrl;
}

// ==================== 发布商品（上传图片 + 写入 Supabase） ====================
window.publishProduct = async function() {
  const name = document.getElementById("name").value.trim();
  const price = document.getElementById("price").value;
  const category = document.getElementById("category").value.trim();
  const description = document.getElementById("description").value.trim();
  const fileInput = document.getElementById("imageInput");

  if (!name || !price) {
    alert("请填写商品名称和价格");
    return;
  }

  let imageUrl = "";
  if (fileInput.files.length > 0) {
    document.getElementById("uploadStatus").textContent = "正在上传图片...";
    imageUrl = await uploadImageToSupabase(fileInput.files[0]);
    if (!imageUrl) {
      document.getElementById("uploadStatus").textContent = "上传失败，请检查存储桶策略";
      return;
    }
    document.getElementById("uploadStatus").textContent = "图片上传成功";
  }

  const productData = {
    name,
    price: parseFloat(price),
    category,
    description,
    image: imageUrl
  };

  const { error } = await supabase
    .from('products')
    .insert([productData]);

  if (error) {
    alert("添加商品失败：" + error.message);
    return;
  }

  alert("商品发布成功！");
  // 清空表单（商品列表会由 Realtime 自动更新）
  document.getElementById("name").value = "";
  document.getElementById("price").value = "";
  document.getElementById("category").value = "";
  document.getElementById("description").value = "";
  fileInput.value = "";
  document.getElementById("preview").style.display = "none";
  document.getElementById("uploadStatus").textContent = "";
};

// ==================== 购物车示例 ====================
window.addToCart = function(id) {
  alert("已加入购物车: " + id);
};

// ==================== 工具函数：防 XSS ====================
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}